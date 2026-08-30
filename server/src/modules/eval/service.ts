import type { Container } from '../../platform/container.js';
import type {
  Agent,
  EvalAgentDashboard,
  EvalBatch,
  EvalCase,
  EvalCaseInput,
  EvalCaseWithRuns,
  EvalCompare,
  EvalDashboard,
  EvalDashboardRow,
  EvalDashboardRunAllResult,
  EvalOwnerKind,
  EvalRun,
  EvalRunAllResult,
  EvalRunRecord,
  EvalRunResult,
  EvalTrendPoint,
  LLMProvider,
  Provider,
} from '@devdigest/shared';
import { AgentVersionConfig } from '@devdigest/shared';
import { scoreBatch, type BatchCase } from '@devdigest/reviewer-core';
import { NotFoundError, ValidationError } from '../../platform/errors.js';
import { EvalRepository, type EvalCaseRow } from './repository.js';
import { EvalRunExecutor, type EvalCaseExecution } from './run-executor.js';
import {
  agentRowToDto,
  parseExpectations,
  reproFromPasses,
  resolveRange,
  toEvalBatchDto,
  toEvalCaseDto,
  toEvalRunRecordDto,
  type EvalRunConfig,
} from './helpers.js';
import {
  DEFAULT_REPRO_WINDOW,
  DEFAULT_RUNS_LIMIT,
  EVAL_SKILL_HOST_MODEL,
  EVAL_SKILL_HOST_PROMPT,
  EVAL_SKILL_HOST_PROVIDER,
} from './constants.js';

/** A resolved run config plus the provider it executes against. */
interface ResolvedRun {
  config: EvalRunConfig;
  llm: LLMProvider;
}

/**
 * Eval service (application ring) — orchestrates eval-case CRUD, ad-hoc "Run N×",
 * per-owner and whole-dashboard run-all, the reproducibility window, the
 * date-filtered dashboards/batches, run-vs-run Compare, and Promote.
 *
 * Onion discipline: routes → THIS service → run-executor → repository (Drizzle).
 * Agent config + Promote flow ONLY through `container.agentsRepo` (the sanctioned
 * facade), never a `modules/agents` import and never a query against another
 * module's table.
 */
export class EvalService {
  private repo: EvalRepository;
  private executor: EvalRunExecutor;

  constructor(private container: Container) {
    this.repo = new EvalRepository(container.db);
    this.executor = new EvalRunExecutor();
  }

  // ---- Cases (CRUD + list rows) ------------------------------------------

  /** Case-list rows: each case + its last run + repro over the pinned version. */
  async listCases(
    workspaceId: string,
    ownerKind: EvalOwnerKind,
    ownerId: string,
  ): Promise<EvalCaseWithRuns[]> {
    const cases = await this.repo.listCases(workspaceId, ownerKind, ownerId);
    return Promise.all(cases.map((c) => this.caseWithRuns(c)));
  }

  private async caseWithRuns(caseRow: EvalCaseRow): Promise<EvalCaseWithRuns> {
    const base = toEvalCaseDto(caseRow);
    const [lastRun] = await this.repo.runsForCase(caseRow.id, { limit: 1 });
    if (!lastRun) return base;

    // Reproducibility window: the pinned version is the LAST run's version, so
    // pre-edit runs (a different `agent_version`) never count (AC-15).
    const window = await this.repo.runsForCase(caseRow.id, {
      agentVersion: lastRun.agentVersion,
      limit: DEFAULT_REPRO_WINDOW,
    });
    const repro = reproFromPasses(
      window.map((r) => r.pass ?? false),
      DEFAULT_REPRO_WINDOW,
    );
    return { ...base, last_run: toEvalRunRecordDto(lastRun, caseRow.name), repro };
  }

  async getCase(workspaceId: string, id: string): Promise<EvalCase | undefined> {
    const row = await this.repo.getCase(workspaceId, id);
    return row ? toEvalCaseDto(row) : undefined;
  }

  async createCase(workspaceId: string, input: EvalCaseInput): Promise<EvalCase> {
    const row = await this.repo.createCase({
      workspaceId,
      ownerKind: input.owner_kind,
      ownerId: input.owner_id,
      name: input.name,
      inputDiff: input.input_diff,
      inputFiles: input.input_files ?? null,
      inputMeta: input.input_meta ?? null,
      expectedOutput: input.expected_output,
      notes: input.notes ?? null,
    });
    return toEvalCaseDto(row);
  }

  async updateCase(
    workspaceId: string,
    id: string,
    input: EvalCaseInput,
  ): Promise<EvalCase | undefined> {
    const row = await this.repo.updateCase(workspaceId, id, {
      name: input.name,
      inputDiff: input.input_diff,
      inputFiles: input.input_files ?? null,
      inputMeta: input.input_meta ?? null,
      expectedOutput: input.expected_output,
      notes: input.notes ?? null,
    });
    return row ? toEvalCaseDto(row) : undefined;
  }

  deleteCase(workspaceId: string, id: string): Promise<boolean> {
    return this.repo.deleteCase(workspaceId, id);
  }

  // ---- Ad-hoc "Run N×" (AC-13) -------------------------------------------

  /**
   * Execute a case `times` times against its pinned version, persisting `times`
   * `eval_runs` with `batch_id = null` (ad-hoc, not a batch). Returns one
   * `EvalRunResult` per execution. Throws 404 if the case is out of workspace.
   */
  async runCaseTimes(
    workspaceId: string,
    caseId: string,
    times: number,
  ): Promise<EvalRunResult[]> {
    const caseRow = await this.repo.getCase(workspaceId, caseId);
    if (!caseRow) throw new NotFoundError('Eval case not found');

    const resolved = await this.resolveRun(workspaceId, caseRow.ownerKind, caseRow.ownerId);
    const isSkill = caseRow.ownerKind === 'skill';
    const results: EvalRunResult[] = [];
    for (let i = 0; i < times; i += 1) {
      const exec = await this.executor.runCase(resolved.config, caseRow, resolved.llm);
      // Skill cases run a SECOND time with the skill ablated (skills: []) so the UI
      // can show the skill's marginal effect ("With skill X% / Without skill Y%").
      const withoutExec = isSkill
        ? await this.executor.runCase({ ...resolved.config, skills: [] }, caseRow, resolved.llm)
        : null;
      results.push(
        await this.persistRun(caseRow, exec, resolved.config.agentVersion, null, withoutExec),
      );
    }
    return results;
  }

  /** Runs for a case, newest-first (drives the ReproRateBadge). 404 if out of workspace. */
  async caseRuns(
    workspaceId: string,
    caseId: string,
    limit = DEFAULT_RUNS_LIMIT,
  ): Promise<EvalRunRecord[]> {
    const caseRow = await this.repo.getCase(workspaceId, caseId);
    if (!caseRow) throw new NotFoundError('Eval case not found');
    const runs = await this.repo.runsForCase(caseId, { limit });
    return runs.map((r) => toEvalRunRecordDto(r, caseRow.name));
  }

  // ---- Run-all (AC-22, AC-25) --------------------------------------------

  /**
   * Run every case for an owner ONCE against the pinned version, score each,
   * persist one `eval_runs` per case with the batch id, then micro-average into
   * exactly ONE `eval_batches` row (one trend point).
   */
  async runAll(
    workspaceId: string,
    ownerKind: EvalOwnerKind,
    ownerId: string,
    version?: number,
  ): Promise<EvalRunAllResult> {
    const resolved = await this.resolveRun(workspaceId, ownerKind, ownerId, version);
    const cases = await this.repo.listCases(workspaceId, ownerKind, ownerId);

    // Execute each case once (the single LLM call per case lives in the executor).
    // Skill cases also run once WITHOUT the skill (ablation) for the with/without UI.
    const isSkill = ownerKind === 'skill';
    const executed: {
      caseRow: EvalCaseRow;
      exec: EvalCaseExecution;
      withoutExec: EvalCaseExecution | null;
    }[] = [];
    for (const caseRow of cases) {
      const exec = await this.executor.runCase(resolved.config, caseRow, resolved.llm);
      const withoutExec = isSkill
        ? await this.executor.runCase({ ...resolved.config, skills: [] }, caseRow, resolved.llm)
        : null;
      executed.push({ caseRow, exec, withoutExec });
    }

    // Micro-average — ZERO-LLM (pure scorer).
    const batchCases: BatchCase[] = executed.map(({ caseRow, exec }) => ({
      name: caseRow.name,
      expectations: exec.expectations,
      grounded: exec.grounded,
      producedCount: exec.producedCount,
    }));
    const batchScore = scoreBatch(batchCases);
    // Cost/duration count BOTH sides of a skill case (two LLM calls); agent cases
    // have no `withoutExec` so this is unchanged for them.
    const costUsd = sumCost(executed.flatMap((e) => [e.exec.costUsd, e.withoutExec?.costUsd ?? null]));
    const durationMs = executed.reduce(
      (n, e) => n + e.exec.durationMs + (e.withoutExec?.durationMs ?? 0),
      0,
    );

    const batchRow = await this.repo.insertBatch({
      workspaceId,
      ownerKind,
      ownerId,
      agentVersion: resolved.config.agentVersion,
      recall: batchScore.recall,
      precision: batchScore.precision,
      citationAccuracy: batchScore.citation_accuracy,
      passRate: batchScore.pass_rate,
      tracesPassed: batchScore.traces_passed,
      tracesTotal: batchScore.traces_total,
      casesTotal: cases.length,
      costUsd,
      durationMs,
    });

    // One eval_runs per case, tagged with this batch id.
    const runs: EvalRunResult[] = [];
    for (const { caseRow, exec, withoutExec } of executed) {
      runs.push(
        await this.persistRun(caseRow, exec, resolved.config.agentVersion, batchRow.id, withoutExec),
      );
    }
    return { batch: toEvalBatchDto(batchRow), runs };
  }

  /** Run-all for EVERY agent that has ≥1 case → one batch each (agents only). */
  async dashboardRunAll(workspaceId: string): Promise<EvalDashboardRunAllResult> {
    const agents = await this.container.agentsRepo.list(workspaceId);
    const counts = await this.repo.countCasesByOwner(workspaceId, 'agent');
    const batches: EvalBatch[] = [];
    for (const agent of agents) {
      if ((counts.get(agent.id) ?? 0) === 0) continue;
      const { batch } = await this.runAll(workspaceId, 'agent', agent.id);
      batches.push(batch);
    }
    return { batches };
  }

  // ---- Dashboards (AC-20, AC-21, AC-29) ----------------------------------

  /** Per-owner detail: date-filtered trend + current/delta + recent runs. */
  async ownerDashboard(
    workspaceId: string,
    ownerKind: EvalOwnerKind,
    ownerId: string,
    from?: string,
    to?: string,
  ): Promise<EvalDashboard> {
    const range = resolveRange(from, to);
    if (!range) throw new ValidationError('Invalid from/to date range');

    const batches = await this.repo.batchesForOwner(
      workspaceId,
      ownerKind,
      ownerId,
      range.from,
      range.to,
    );
    const counts = await this.repo.countCasesByOwner(workspaceId, ownerKind);
    const recentRuns = await this.repo.recentRunsForOwner(workspaceId, ownerKind, ownerId, 10);

    const trend: EvalTrendPoint[] = batches.map((b) => ({
      ran_at: b.ranAt.toISOString(),
      recall: b.recall ?? 0,
      precision: b.precision ?? 0,
      citation_accuracy: b.citationAccuracy ?? 0,
      pass_rate: b.passRate ?? 0,
      cost_usd: b.costUsd ?? null,
    }));
    const last = batches.at(-1);
    const prev = batches.at(-2);

    const current = {
      recall: last?.recall ?? 0,
      precision: last?.precision ?? 0,
      citation_accuracy: last?.citationAccuracy ?? 0,
      traces_passed: last?.tracesPassed ?? 0,
      traces_total: last?.tracesTotal ?? 0,
      cost_usd: last?.costUsd ?? null,
    };
    const delta = {
      recall: (last?.recall ?? 0) - (prev?.recall ?? last?.recall ?? 0),
      precision: (last?.precision ?? 0) - (prev?.precision ?? last?.precision ?? 0),
      citation_accuracy:
        (last?.citationAccuracy ?? 0) - (prev?.citationAccuracy ?? last?.citationAccuracy ?? 0),
    };
    const alert = prev && delta.recall < 0 ? 'Recall dropped versus the previous run' : null;

    return {
      owner_kind: ownerKind,
      owner_id: ownerId,
      cases_total: counts.get(ownerId) ?? 0,
      current,
      delta,
      trend,
      recent_runs: recentRuns.map(({ run, caseName }) => toEvalRunRecordDto(run, caseName)),
      alert,
    };
  }

  /** Whole-workspace, AGENTS-ONLY dashboard (AC-20). Skills never appear here. */
  async agentDashboard(workspaceId: string): Promise<EvalAgentDashboard> {
    const agents = await this.container.agentsRepo.list(workspaceId);
    const counts = await this.repo.countCasesByOwner(workspaceId, 'agent');
    const epoch = new Date(0);
    const now = new Date();

    const rows: EvalDashboardRow[] = await Promise.all(
      agents.map(async (agent): Promise<EvalDashboardRow> => {
        const batches = await this.repo.batchesForOwner(workspaceId, 'agent', agent.id, epoch, now);
        const last = batches.at(-1);
        return {
          owner_id: agent.id,
          name: agent.name,
          model: agent.model,
          agent_version: agent.version,
          cases_total: counts.get(agent.id) ?? 0,
          last_batch: last ? toEvalBatchDto(last) : null,
          sparkline: batches.map((b) => b.recall ?? 0),
        };
      }),
    );

    const recent = await this.repo.recentBatches(workspaceId, 'agent', 10);
    return { agents: rows, recent_batches: recent.map(toEvalBatchDto) };
  }

  /** Date-filtered batches for an owner (AC-29). */
  async ownerBatches(
    workspaceId: string,
    ownerKind: EvalOwnerKind,
    ownerId: string,
    from?: string,
    to?: string,
  ): Promise<EvalBatch[]> {
    const range = resolveRange(from, to);
    if (!range) throw new ValidationError('Invalid from/to date range');
    const batches = await this.repo.batchesForOwner(
      workspaceId,
      ownerKind,
      ownerId,
      range.from,
      range.to,
    );
    return batches.map(toEvalBatchDto);
  }

  // ---- Compare + Promote (AC-23, AC-24) ----------------------------------

  async compare(workspaceId: string, base: string, head: string): Promise<EvalCompare> {
    const [baseRow, headRow] = await Promise.all([
      this.repo.getBatch(workspaceId, base),
      this.repo.getBatch(workspaceId, head),
    ]);
    if (!baseRow || !headRow) throw new NotFoundError('Batch not found');

    const baseDto = toEvalBatchDto(baseRow);
    const headDto = toEvalBatchDto(headRow);
    const [basePrompt, headPrompt] = await Promise.all([
      this.resolveBatchPrompt(baseRow.ownerKind, baseRow.ownerId, baseRow.agentVersion),
      this.resolveBatchPrompt(headRow.ownerKind, headRow.ownerId, headRow.agentVersion),
    ]);

    return {
      base: baseDto,
      head: headDto,
      delta: {
        recall: headDto.recall - baseDto.recall,
        precision: headDto.precision - baseDto.precision,
        citation_accuracy: headDto.citation_accuracy - baseDto.citation_accuracy,
        pass_rate: headDto.pass_rate - baseDto.pass_rate,
      },
      base_prompt: basePrompt,
      head_prompt: headPrompt,
    };
  }

  /**
   * Promote a version's config onto the agent through `agentsRepo` — the single
   * version-snapshotting path (AC-24). Restores the version's linked skills first
   * so the fresh snapshot the update creates fully matches the promoted config.
   */
  async promote(workspaceId: string, agentId: string, version: number): Promise<Agent | undefined> {
    const agent = await this.container.agentsRepo.getById(workspaceId, agentId);
    if (!agent) return undefined;
    const vrow = await this.container.agentsRepo.getVersion(agentId, version);
    if (!vrow) throw new NotFoundError('Agent version not found');
    const cfg = AgentVersionConfig.parse(vrow.configJson);

    await this.container.agentsRepo.setSkills(agentId, cfg.skills);
    const updated = await this.container.agentsRepo.update(workspaceId, agentId, {
      provider: cfg.provider,
      model: cfg.model,
      systemPrompt: cfg.system_prompt,
      outputSchema: cfg.output_schema,
      strategy: cfg.strategy,
      ciFailOn: cfg.ci_fail_on,
      repoIntel: cfg.repo_intel,
    });
    return updated ? agentRowToDto(updated) : undefined;
  }

  // ---- Resolution --------------------------------------------------------

  /**
   * Resolve the run config + provider for an owner's pinned version.
   *
   * Agent: the version's `configJson` (via `agentsRepo.getVersion`) supplies the
   * prompt/model/provider; skill BODIES are resolved from the currently-linked
   * skills (`agentsRepo.linkedSkills`) intersected with the version's skill ids —
   * exactly the facade `reviews/run-executor.ts` uses (no module→module import).
   *
   * Skill (AC-19): the host run is agent-independent — a fixed neutral prompt
   * (`EVAL_SKILL_HOST_PROMPT`) + the workspace-default provider/model, with ONLY
   * the skill's body as the sole skill and `skill.version` pinned into the run's
   * `agent_version`. The body/version come from the `container.skillsRepo` facade
   * (the sanctioned foundation seam — never a `modules/skills` import nor a
   * cross-table query from the eval repository).
   */
  private async resolveRun(
    workspaceId: string,
    ownerKind: EvalOwnerKind,
    ownerId: string,
    version?: number,
  ): Promise<ResolvedRun> {
    if (ownerKind === 'skill') {
      const skill = await this.container.skillsRepo.getById(workspaceId, ownerId);
      if (!skill) throw new NotFoundError('Skill not found');
      const llm = await this.container.llm(EVAL_SKILL_HOST_PROVIDER);
      return {
        config: {
          systemPrompt: EVAL_SKILL_HOST_PROMPT,
          model: EVAL_SKILL_HOST_MODEL,
          skills: [skill.body],
          agentVersion: skill.version,
        },
        llm,
      };
    }

    const agent = await this.container.agentsRepo.getById(workspaceId, ownerId);
    if (!agent) throw new NotFoundError('Agent not found');
    const pinned = version ?? agent.version;
    const vrow = await this.container.agentsRepo.getVersion(ownerId, pinned);
    if (!vrow) throw new NotFoundError('Agent version not found');
    const cfg = AgentVersionConfig.parse(vrow.configJson);

    const wanted = new Set(cfg.skills);
    const linked = await this.container.agentsRepo.linkedSkills(ownerId);
    const skills = linked
      .filter((l) => l.skill.enabled && wanted.has(l.skill.id))
      .map((l) => l.skill.body);

    const llm = await this.container.llm(cfg.provider as Provider);
    return {
      config: {
        systemPrompt: cfg.system_prompt,
        model: cfg.model,
        skills,
        agentVersion: pinned,
      },
      llm,
    };
  }

  /**
   * Resolve a batch's version → its system prompt for the Compare diff. Agent
   * batches resolve via `agentsRepo.getVersion`; anything unresolvable (missing
   * version/config, or a skill batch with no facade) DEGRADES to a marker rather
   * than throwing (spec edge case — the panel shows "prompt unavailable").
   */
  private async resolveBatchPrompt(
    ownerKind: EvalOwnerKind,
    ownerId: string,
    agentVersion: number | null,
  ): Promise<string> {
    const unavailable = 'prompt unavailable';
    if (ownerKind !== 'agent' || agentVersion == null) return unavailable;
    try {
      const vrow = await this.container.agentsRepo.getVersion(ownerId, agentVersion);
      if (!vrow) return unavailable;
      return AgentVersionConfig.parse(vrow.configJson).system_prompt;
    } catch {
      return unavailable;
    }
  }

  // ---- Persistence helpers -----------------------------------------------

  private async persistRun(
    caseRow: EvalCaseRow,
    exec: EvalCaseExecution,
    agentVersion: number | null,
    batchId: string | null,
    withoutExec?: EvalCaseExecution | null,
  ): Promise<EvalRunResult> {
    // Scalar metric columns always hold the WITH-skill (primary) result, so every
    // existing dashboard/repro/batch aggregate keeps its meaning. When a skill case
    // also ran ablated, `actual_output` carries BOTH sides ({ with, without }) so the
    // UI can show "With skill / Without skill"; otherwise it stays the grounded list.
    const actualOutput = withoutExec
      ? { with: execSide(exec), without: execSide(withoutExec) }
      : exec.grounded;
    const durationMs = exec.durationMs + (withoutExec?.durationMs ?? 0);
    const costUsd = withoutExec
      ? sumCost([exec.costUsd, withoutExec.costUsd])
      : exec.costUsd;

    const runRow = await this.repo.insertRun({
      caseId: caseRow.id,
      actualOutput,
      pass: exec.score.pass,
      recall: exec.score.recall,
      precision: exec.score.precision,
      citationAccuracy: exec.score.citationAccuracy,
      durationMs,
      costUsd,
      batchId,
      agentVersion,
    });
    return {
      run_id: runRow.id,
      case_id: caseRow.id,
      result: this.toEvalRun(caseRow, exec),
    };
  }

  /** The single-case `EvalRun` metrics DTO for an `EvalRunResult`. */
  private toEvalRun(caseRow: EvalCaseRow, exec: EvalCaseExecution): EvalRun {
    return {
      recall: exec.score.recall,
      precision: exec.score.precision,
      citation_accuracy: exec.score.citationAccuracy,
      traces_passed: exec.score.pass ? 1 : 0,
      traces_total: 1,
      duration_ms: exec.durationMs,
      cost_usd: exec.costUsd,
      per_trace: [
        {
          name: caseRow.name,
          pass: exec.score.pass,
          expected: parseExpectations(caseRow.expectedOutput),
          actual: exec.grounded,
        },
      ],
    };
  }

  /** Constants exposed for the skill-host path (used by tests and the skillsRepo run path). */
  static readonly SKILL_HOST = {
    prompt: EVAL_SKILL_HOST_PROMPT,
    provider: EVAL_SKILL_HOST_PROVIDER,
    model: EVAL_SKILL_HOST_MODEL,
  };
}

/** The persisted per-side payload for a skill run's paired `actual_output`. */
function execSide(e: EvalCaseExecution) {
  return {
    grounded: e.grounded,
    recall: e.score.recall,
    precision: e.score.precision,
    citation_accuracy: e.score.citationAccuracy,
    pass: e.score.pass,
  };
}

/** Sum provider-reported costs; null when every run reported null (honest "unknown"). */
function sumCost(costs: (number | null)[]): number | null {
  const known = costs.filter((c): c is number => c != null);
  return known.length === 0 ? null : known.reduce((a, b) => a + b, 0);
}
