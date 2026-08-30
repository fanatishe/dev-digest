import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { and, eq } from 'drizzle-orm';
import { startPg, dockerAvailable, type PgFixture } from '../../../test/helpers/pg.js';
import { loadConfig } from '../../platform/config.js';
import { seed } from '../../db/seed.js';
import * as t from '../../db/schema.js';
import { Container } from '../../platform/container.js';
import { AgentsRepository } from '../agents/repository.js';
import { SkillsRepository } from '../skills/repository.js';
import { MockLLMProvider } from '../../adapters/mocks.js';
import type { Review } from '@devdigest/shared';
import { EvalService } from './service.js';
import { EVAL_SKILL_HOST_PROMPT } from './constants.js';

/**
 * DB-backed — the eval service against real Postgres with a MockLLMProvider
 * injected via ContainerOverrides. Covers the zero-LLM proof (AC-6), one-batch
 * run-all (AC-22), ad-hoc Run N× (AC-13), the pinned-version repro window
 * (AC-15), date-filtered batches (AC-29), Promote (AC-24), and agents-only
 * dashboard (AC-20). Skips cleanly when Docker is unavailable.
 */

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

if (!hasDocker) {
  // eslint-disable-next-line no-console
  console.warn('[eval-service] Docker not available — skipping integration tests.');
}

const DIFF_RAW = [
  'diff --git a/src/config.ts b/src/config.ts',
  '--- a/src/config.ts',
  '+++ b/src/config.ts',
  '@@ -10,3 +10,4 @@',
  '   port: 3000,',
  '+  stripeKey: "sk_live_xxx",',
  '   redisUrl: x,',
].join('\n');

const REVIEW_FIXTURE: Review = {
  verdict: 'request_changes',
  summary: 'secret',
  score: 20,
  findings: [
    {
      id: 'f1',
      severity: 'CRITICAL',
      category: 'security',
      title: 'Hardcoded key',
      file: 'src/config.ts',
      start_line: 11,
      end_line: 11,
      rationale: 'live secret committed',
      confidence: 0.9,
    },
  ],
};

const EXPECTED = {
  expectations: [{ kind: 'must_find', file: 'src/config.ts', start_line: 11, end_line: 11 }],
};

d('EvalService (DB-backed)', () => {
  let pg: PgFixture;
  let workspaceId: string;

  beforeAll(async () => {
    pg = await startPg();
    await seed(pg.handle.db);
    const [ws] = await pg.handle.db
      .select({ id: t.workspaces.id })
      .from(t.workspaces)
      .where(eq(t.workspaces.name, 'default'));
    workspaceId = ws!.id;
  });
  afterAll(async () => {
    await pg?.stop();
  });

  const config = loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv);

  function makeService(mock: MockLLMProvider): EvalService {
    const container = new Container(config, pg.handle.db, { llm: { openai: mock } });
    return new EvalService(container);
  }

  /** A fresh agent (provider openai so the mock intercepts) with v1 snapshot. */
  async function makeAgent(name: string): Promise<string> {
    const repo = new AgentsRepository(pg.handle.db);
    const agent = await repo.insert({
      workspaceId,
      name,
      provider: 'openai',
      model: 'gpt-4.1',
      systemPrompt: 'Review the diff.',
    });
    return agent.id;
  }

  async function makeCase(agentId: string, name: string): Promise<string> {
    const svc = makeService(new MockLLMProvider('openai', { structured: REVIEW_FIXTURE }));
    const created = await svc.createCase(workspaceId, {
      owner_kind: 'agent',
      owner_id: agentId,
      name,
      input_diff: DIFF_RAW,
      expected_output: EXPECTED,
    });
    return created.id;
  }

  it('run-all makes exactly K LLM calls, one batch, one run per case (AC-6, AC-22)', async () => {
    const agentId = await makeAgent('runall-agent');
    const K = 3;
    for (let i = 0; i < K; i += 1) await makeCase(agentId, `case-${i}`);

    const mock = new MockLLMProvider('openai', { structured: REVIEW_FIXTURE });
    const svc = makeService(mock);
    const result = await svc.runAll(workspaceId, 'agent', agentId);

    // AC-6 — the ONLY model calls are the K reviews (scoring is zero-LLM).
    expect(mock.calls.filter((c) => c.method === 'completeStructured')).toHaveLength(K);

    // AC-22 — exactly one batch row, and one eval_run per case tagged with it.
    const batches = await pg.handle.db
      .select()
      .from(t.evalBatches)
      .where(and(eq(t.evalBatches.ownerId, agentId), eq(t.evalBatches.ownerKind, 'agent')));
    expect(batches).toHaveLength(1);
    expect(batches[0]!.casesTotal).toBe(K);
    expect(result.runs).toHaveLength(K);

    const runs = await pg.handle.db
      .select()
      .from(t.evalRuns)
      .where(eq(t.evalRuns.batchId, batches[0]!.id));
    expect(runs).toHaveLength(K);
    expect(runs.every((r) => r.agentVersion === 1)).toBe(true);
  });

  it('Run N× {times:5} writes 5 runs, batch_id null, agent_version pinned (AC-13)', async () => {
    const agentId = await makeAgent('runtimes-agent');
    const caseId = await makeCase(agentId, 'flaky-case');

    const svc = makeService(new MockLLMProvider('openai', { structured: REVIEW_FIXTURE }));
    const results = await svc.runCaseTimes(workspaceId, caseId, 5);
    expect(results).toHaveLength(5);

    const runs = await pg.handle.db.select().from(t.evalRuns).where(eq(t.evalRuns.caseId, caseId));
    expect(runs).toHaveLength(5);
    expect(runs.every((r) => r.batchId === null)).toBe(true);
    expect(runs.every((r) => r.agentVersion === 1)).toBe(true);
  });

  it('batch-from-latest rolls the just-run cases into ONE batch, tags the runs, and labels it', async () => {
    const agentId = await makeAgent('bfl-agent');
    const c1 = await makeCase(agentId, 'first-case');
    const c2 = await makeCase(agentId, 'second-case');
    const svc = makeService(new MockLLMProvider('openai', { structured: REVIEW_FIXTURE }));

    // Per-row-style: run each case once (ad-hoc runs, batch_id null).
    await svc.runCaseTimes(workspaceId, c1, 1);
    await svc.runCaseTimes(workspaceId, c2, 1);

    // A single case → a 1-case batch labelled by the case name.
    const solo = await svc.batchFromLatest(workspaceId, 'agent', agentId, [c1]);
    expect(solo.cases_total).toBe(1);
    expect(solo.traces_total).toBe(1);
    expect(solo.label).toBe('first-case');

    // Both cases → an "All (2)" batch; its two runs are re-tagged to it.
    await svc.runCaseTimes(workspaceId, c1, 1);
    await svc.runCaseTimes(workspaceId, c2, 1);
    const all = await svc.batchFromLatest(workspaceId, 'agent', agentId, [c1, c2]);
    expect(all.cases_total).toBe(2);
    expect(all.label).toBe('All (2)');

    const tagged = await pg.handle.db
      .select()
      .from(t.evalRuns)
      .where(eq(t.evalRuns.batchId, all.id));
    expect(tagged).toHaveLength(2);
  });

  it('the repro window is filtered to the pinned version — a pre-edit run is excluded (AC-15)', async () => {
    const agentId = await makeAgent('repro-agent');
    const svc = makeService(new MockLLMProvider('openai', { structured: REVIEW_FIXTURE }));
    const caseId = await makeCase(agentId, 'versioned-case');

    // Two passing v1 runs, then one failing v2 run (the newest → pinned version).
    const db = pg.handle.db;
    await db.insert(t.evalRuns).values([
      { caseId, pass: true, recall: 1, precision: 1, citationAccuracy: 1, agentVersion: 1, batchId: null },
      { caseId, pass: true, recall: 1, precision: 1, citationAccuracy: 1, agentVersion: 1, batchId: null },
    ]);
    await db
      .insert(t.evalRuns)
      .values({ caseId, pass: false, recall: 0, precision: 1, citationAccuracy: 1, agentVersion: 2, batchId: null });

    const [row] = await svc.listCases(workspaceId, 'agent', agentId);
    // pinned = last run's version (2) → the two v1 runs never count.
    expect(row!.repro?.total).toBe(1);
    expect(row!.repro?.passed).toBe(0);
    expect(row!.repro?.reliable).toBe(false);
  });

  it('batches are date-filtered; default is the last 30 days (AC-29)', async () => {
    const agentId = await makeAgent('dates-agent');
    const db = pg.handle.db;
    const now = new Date();
    const old = new Date(now.getTime() - 60 * 24 * 60 * 60 * 1000); // 60 days ago

    await db.insert(t.evalBatches).values([
      { workspaceId, ownerKind: 'agent', ownerId: agentId, agentVersion: 1, recall: 0.5, precision: 0.5, citationAccuracy: 1, passRate: 0.5, tracesPassed: 1, tracesTotal: 2, casesTotal: 2, ranAt: old },
      { workspaceId, ownerKind: 'agent', ownerId: agentId, agentVersion: 2, recall: 1, precision: 1, citationAccuracy: 1, passRate: 1, tracesPassed: 2, tracesTotal: 2, casesTotal: 2, ranAt: now },
    ]);

    const svc = makeService(new MockLLMProvider('openai', { structured: REVIEW_FIXTURE }));
    // default (last 30d) → only the recent batch.
    const recent = await svc.ownerBatches(workspaceId, 'agent', agentId);
    expect(recent).toHaveLength(1);
    expect(recent[0]!.agent_version).toBe(2);

    // explicit wide range → both.
    const all = await svc.ownerBatches(
      workspaceId,
      'agent',
      agentId,
      new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000).toISOString(),
      now.toISOString(),
    );
    expect(all).toHaveLength(2);
  });

  it('Promote round-trips a version config through agentsRepo (AC-24)', async () => {
    const agentId = await makeAgent('promote-agent');
    const agentsRepo = new AgentsRepository(pg.handle.db);
    // Edit the prompt → bumps to v2 with a different config.
    await agentsRepo.update(workspaceId, agentId, { systemPrompt: 'RUINED silent prompt' });

    const svc = makeService(new MockLLMProvider('openai', { structured: REVIEW_FIXTURE }));
    const promoted = await svc.promote(workspaceId, agentId, 1);

    expect(promoted).toBeDefined();
    expect(promoted!.system_prompt).toBe('Review the diff.'); // v1's config restored
  });

  /** A skill inserted then body-bumped, so its current version is 2 (not the v1 default). */
  async function makeSkill(name: string, body: string): Promise<{ id: string; version: number }> {
    const repo = new SkillsRepository(pg.handle.db);
    const skill = await repo.insert({
      workspaceId,
      name,
      description: 'eval skill',
      type: 'rubric',
      source: 'manual',
      body,
    });
    // Body change → version bump (v2), proving skill.version (not a hardcoded 1)
    // is what gets pinned into the run's agent_version below.
    const bumped = await repo.update(workspaceId, skill.id, { body: `${body}\n\nrefined.` });
    return { id: skill.id, version: bumped!.version };
  }

  it('a skill case run resolves the real skill body + version via container.skillsRepo (AC-19)', async () => {
    const SKILL_BODY = '# Secret leak\nFlag any hardcoded credential added by the diff.';
    const finalBody = `${SKILL_BODY}\n\nrefined.`;
    const { id: skillId, version } = await makeSkill('secret-skill', SKILL_BODY);
    expect(version).toBe(2);

    // The skill host run uses the workspace-default provider (openrouter) — inject
    // the mock under THAT id so its single review is intercepted.
    const mock = new MockLLMProvider('openai', { structured: REVIEW_FIXTURE });
    const container = new Container(config, pg.handle.db, { llm: { openrouter: mock } });
    const svc = new EvalService(container);

    const created = await svc.createCase(workspaceId, {
      owner_kind: 'skill',
      owner_id: skillId,
      name: 'skill-live-case',
      input_diff: DIFF_RAW,
      expected_output: EXPECTED,
    });

    const results = await svc.runCaseTimes(workspaceId, created.id, 1);
    expect(results).toHaveLength(1);

    // AC-19 — a SKILL case runs TWICE per execution: once WITH the skill body injected
    // and once ablated (skills: []), so the tab can show "With skill / Without skill".
    // Scoring stays zero-LLM — the only model calls are these two reviews.
    const structuredCalls = mock.calls.filter((c) => c.method === 'completeStructured');
    expect(structuredCalls).toHaveLength(2);

    const messagesOf = (i: number) =>
      (structuredCalls[i]!.req as { messages: { role: string; content: string }[] }).messages;
    const systems = [0, 1].map((i) => messagesOf(i).find((m) => m.role === 'system')!.content);
    const users = [0, 1].map((i) => messagesOf(i).find((m) => m.role === 'user')!.content);

    // Both sides use the fixed host prompt (EVAL_SKILL_HOST_PROMPT), nothing agent-specific.
    expect(systems.every((sys) => sys.startsWith(EVAL_SKILL_HOST_PROMPT))).toBe(true);
    // Exactly one call injects the resolved skill BODY (WITH, v2's current body); the
    // other has no skills section at all (WITHOUT — the ablation).
    expect(users.filter((u) => u.includes(finalBody))).toHaveLength(1);
    expect(users.filter((u) => !u.includes('## Skills / rules'))).toHaveLength(1);

    // Still ONE persisted eval_run, version pinned, carrying the paired { with, without }.
    const runs = await pg.handle.db
      .select()
      .from(t.evalRuns)
      .where(eq(t.evalRuns.caseId, created.id));
    expect(runs).toHaveLength(1);
    expect(runs[0]!.agentVersion).toBe(2);
    const ao = runs[0]!.actualOutput as { with?: unknown; without?: unknown };
    expect(ao.with).toBeDefined();
    expect(ao.without).toBeDefined();
  });

  it('the agents-only dashboard lists no skill owners (AC-20)', async () => {
    const svc = makeService(new MockLLMProvider('openai', { structured: REVIEW_FIXTURE }));
    const dash = await svc.agentDashboard(workspaceId);
    // Every row is an agent that exists; no skill ever appears (there is no
    // owner_kind field on a row, and the query is hard-scoped to 'agent').
    expect(Array.isArray(dash.agents)).toBe(true);
    expect(dash.recent_batches.every((b) => b.owner_kind === 'agent')).toBe(true);
  });
});
