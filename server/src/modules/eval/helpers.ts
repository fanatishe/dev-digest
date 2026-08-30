import type {
  Agent,
  CiFailOn,
  EvalBatch,
  EvalCase,
  EvalExpectedFinding,
  EvalReproducibility,
  EvalRunRecord,
  EvalOwnerKind,
  LLMProvider,
  Provider,
  ReviewStrategy,
  UnifiedDiff,
} from '@devdigest/shared';
import { EvalExpectedOutput } from '@devdigest/shared';
import type { ReviewInput } from '@devdigest/reviewer-core';
import type { AgentRow } from '../../db/rows.js';
import type { EvalBatchRow, EvalCaseRow, EvalRunRow } from './repository.js';
import { DEFAULT_RANGE_DAYS, REPRO_RELIABLE_THRESHOLD } from './constants.js';

/**
 * Pure helpers for the eval module — row⇄DTO mapping, expectation parsing, the
 * reproducibility aggregate, date-range defaulting, and the HERMETIC review-input
 * assembly. No I/O (domain-core ring): every function takes data and returns data.
 * The `LLMProvider` handed to `assembleEvalReviewInput` is a reference, not a
 * call — the executor (app ring) is what invokes the engine.
 */

/** A fixed, neutral task line for an eval run (hermetic — no PR-specific framing). */
export const EVAL_TASK_LINE = 'Review the diff for this eval case.';

// ---- Row → DTO mappers ----------------------------------------------------

/** Map a persisted `eval_cases` row to the public `EvalCase` DTO. */
export function toEvalCaseDto(row: EvalCaseRow): EvalCase {
  return {
    id: row.id,
    owner_kind: row.ownerKind,
    owner_id: row.ownerId,
    name: row.name,
    input_diff: row.inputDiff ?? '',
    input_files: row.inputFiles ?? null,
    input_meta: row.inputMeta ?? null,
    expected_output: row.expectedOutput ?? null,
    notes: row.notes ?? null,
  };
}

/** Map a persisted `eval_runs` row to the public `EvalRunRecord` DTO. */
export function toEvalRunRecordDto(row: EvalRunRow, caseName?: string | null): EvalRunRecord {
  return {
    id: row.id,
    case_id: row.caseId,
    case_name: caseName ?? null,
    ran_at: row.ranAt.toISOString(),
    actual_output: row.actualOutput ?? null,
    pass: row.pass ?? null,
    recall: row.recall ?? null,
    precision: row.precision ?? null,
    citation_accuracy: row.citationAccuracy ?? null,
    duration_ms: row.durationMs ?? null,
    cost_usd: row.costUsd ?? null,
  };
}

/**
 * Map a persisted `eval_batches` row to the public `EvalBatch` DTO. The metric
 * columns are nullable in the DB (a batch could in principle be written empty),
 * but the contract types them as non-null numbers — coalesce a missing metric to
 * a neutral `0`/`1` so the trend never renders `NaN`.
 */
export function toEvalBatchDto(row: EvalBatchRow, label?: string | null): EvalBatch {
  return {
    id: row.id,
    workspace_id: row.workspaceId,
    owner_kind: row.ownerKind,
    owner_id: row.ownerId,
    agent_version: row.agentVersion ?? null,
    ran_at: row.ranAt.toISOString(),
    recall: row.recall ?? 0,
    precision: row.precision ?? 0,
    citation_accuracy: row.citationAccuracy ?? 0,
    pass_rate: row.passRate ?? 0,
    traces_passed: row.tracesPassed ?? 0,
    traces_total: row.tracesTotal ?? 0,
    cases_total: row.casesTotal ?? 0,
    cost_usd: row.costUsd ?? null,
    duration_ms: row.durationMs ?? null,
    label: label ?? null,
  };
}

/** The recent-runs label for a batch: a 1-case batch shows that case's name; anything
 *  else shows "All (<cases_total>)". `caseNames` are the distinct case names in the batch. */
export function batchLabel(row: EvalBatchRow, caseNames: readonly string[]): string {
  if ((row.casesTotal ?? 0) === 1 && caseNames.length === 1) return caseNames[0]!;
  return `All (${row.casesTotal ?? caseNames.length})`;
}

/**
 * Map a persisted `agents` row to the public `Agent` DTO — a LOCAL copy of the
 * agents module's mapper. It is duplicated here on purpose: `Promote` returns an
 * `Agent`, but importing `modules/agents/helpers` would be a forbidden
 * module→module import (server INSIGHTS). The row TYPE comes from the shared
 * `db/rows.ts`, not the agents module's data layer.
 */
export function agentRowToDto(row: AgentRow): Agent {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    provider: row.provider as Provider,
    model: row.model,
    system_prompt: row.systemPrompt,
    output_schema: row.outputSchema ?? null,
    enabled: row.enabled,
    version: row.version,
    strategy: row.strategy as ReviewStrategy,
    ci_fail_on: row.ciFailOn as CiFailOn,
    repo_intel: row.repoIntel,
    context_docs: row.contextDocs ?? null,
  };
}

// ---- Expectations ---------------------------------------------------------

/**
 * Parse a case's stored `expected_output` jsonb into validated expectations.
 *
 * SECURITY: the blob is user-authored (the modal writes it) — it is parsed as
 * `EvalExpectedOutput` (validated DATA) and never executed. A malformed/legacy
 * blob degrades to an empty expectation set (a `must_find`-free case → recall 1),
 * never a throw, so a bad row can't take down a whole run-all.
 */
export function parseExpectations(value: unknown): EvalExpectedFinding[] {
  const parsed = EvalExpectedOutput.safeParse(value);
  return parsed.success ? parsed.data.expectations : [];
}

// ---- Reproducibility ------------------------------------------------------

/**
 * Reproduction rate over the last `window` runs (AC-14). `passes` MUST already
 * be the pinned-version runs, newest-first (AC-15 is enforced by the query that
 * produced them). Reliable iff `ratio >= 0.8`.
 */
export function reproFromPasses(passes: readonly boolean[], window: number): EvalReproducibility {
  const slice = passes.slice(0, window);
  const total = slice.length;
  const passed = slice.filter(Boolean).length;
  const ratio = total === 0 ? 0 : passed / total;
  return { passed, total, ratio, reliable: total > 0 && ratio >= REPRO_RELIABLE_THRESHOLD };
}

// ---- Date range -----------------------------------------------------------

export interface DateRange {
  from: Date;
  to: Date;
}

/**
 * Resolve an optional ISO `from`/`to` pair to a concrete range, defaulting to the
 * last `DEFAULT_RANGE_DAYS` (AC-29). Returns `null` for an unparseable bound so the
 * caller can turn it into a 422 rather than a silent all-time / epoch query.
 */
export function resolveRange(from?: string, to?: string): DateRange | null {
  const now = Date.now();
  const toDate = to ? new Date(to) : new Date(now);
  const fromDate = from
    ? new Date(from)
    : new Date(now - DEFAULT_RANGE_DAYS * 24 * 60 * 60 * 1000);
  if (Number.isNaN(fromDate.getTime()) || Number.isNaN(toDate.getTime())) return null;
  return { from: fromDate, to: toDate };
}

// ---- Hermetic review-input assembly (AC-25, AC-19) ------------------------

/** The resolved, provider-agnostic config a single eval run executes against. */
export interface EvalRunConfig {
  /** Trusted system prompt (agent's own, or `EVAL_SKILL_HOST_PROMPT` for a skill). */
  systemPrompt: string;
  /** Model id understood by `llm`. */
  model: string;
  /** Resolved skill BODIES (never ids), in order. Empty → no skills section. */
  skills: string[];
  /** The pinned version recorded on every run/batch this config produces. */
  agentVersion: number | null;
}

/**
 * Build the HERMETIC `ReviewInput` for an eval run (AC-25).
 *
 * Repo-intel is forced OFF structurally: the returned input carries NO `callers`,
 * `repoMap`, `intent`, `prDescription`, `memory` or `specs` — only the prompt, the
 * resolved skills, and the fixed diff move the metrics. `strategy: 'single-pass'`
 * keeps the run deterministic (one call over the whole diff). This is a pure
 * builder (no LLM call) so it is unit-assertable without a provider.
 */
export function assembleEvalReviewInput(
  config: EvalRunConfig,
  diff: UnifiedDiff,
  llm: LLMProvider,
): ReviewInput {
  return {
    systemPrompt: config.systemPrompt,
    model: config.model,
    diff,
    llm,
    strategy: 'single-pass',
    task: EVAL_TASK_LINE,
    // Skills omitted entirely when empty (assemblePrompt drops the section).
    ...(config.skills.length > 0 ? { skills: config.skills } : {}),
    // Deliberately NOTHING else: no callers / repoMap / intent / prDescription /
    // memory / specs — that absence IS the repo_intel-OFF guarantee (AC-25).
  };
}

/** Owner kinds this module scores. Re-exported for local narrowing. */
export type OwnerKind = EvalOwnerKind;
