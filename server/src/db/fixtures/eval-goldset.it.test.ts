import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { and, eq } from 'drizzle-orm';
import { scoreBatch } from '@devdigest/reviewer-core';
import { startPg, dockerAvailable, type PgFixture } from '../../../test/helpers/pg.js';
import { loadConfig } from '../../platform/config.js';
import { Container } from '../../platform/container.js';
import { MockLLMProvider } from '../../adapters/mocks.js';
import { EvalService } from '../../modules/eval/service.js';
import type { EvalExpectedOutput } from '@devdigest/shared';
import * as t from '../schema.js';
import { seed } from '../seed.js';
import {
  GOLDSET_AGENT_NAME,
  GOLDSET_CASES,
  GOLDSET_FLAKY_CASE,
  GOLDSET_STABLE_CASE,
  GOLDSET_VERSIONS,
  goldsetBatchInputs,
} from './eval-goldset.js';

/**
 * DB-backed — the seeded eval gold-set on real Postgres (AC-16, AC-17, AC-26).
 * Proves the no-key demo data is REAL scorer output: the stored `eval_batches`
 * metrics equal `scoreBatch()` recomputed over the same fixtures, ≥8 cases exist
 * with both expectation kinds, and the stable/flaky cases read 5/5 and ~2/5 over
 * their pinned-version repro windows. Skips cleanly when Docker is unavailable.
 */

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

if (!hasDocker) {
  // eslint-disable-next-line no-console
  console.warn('[eval-goldset] Docker not available — skipping integration tests.');
}

d('Eval gold-set seed (DB-backed)', () => {
  let pg: PgFixture;
  let workspaceId: string;
  let agentId: string;

  beforeAll(async () => {
    pg = await startPg();
    await seed(pg.handle.db);
    const [ws] = await pg.handle.db
      .select({ id: t.workspaces.id })
      .from(t.workspaces)
      .where(eq(t.workspaces.name, 'default'));
    workspaceId = ws!.id;
    const [agent] = await pg.handle.db
      .select({ id: t.agents.id })
      .from(t.agents)
      .where(and(eq(t.agents.workspaceId, workspaceId), eq(t.agents.name, GOLDSET_AGENT_NAME)));
    agentId = agent!.id;
  });
  afterAll(async () => {
    await pg?.stop();
  });

  const config = loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv);
  const makeService = (): EvalService =>
    new EvalService(
      new Container(config, pg.handle.db, {
        llm: { openai: new MockLLMProvider('openai') },
      }),
    );

  it('seeds >= 8 cases with both expectation kinds present (AC-16)', async () => {
    const cases = await pg.handle.db
      .select()
      .from(t.evalCases)
      .where(and(eq(t.evalCases.ownerKind, 'agent'), eq(t.evalCases.ownerId, agentId)));
    expect(cases.length).toBeGreaterThanOrEqual(8);

    const kinds = new Set(
      cases.map((c) => (c.expectedOutput as EvalExpectedOutput).expectations[0]?.kind),
    );
    expect(kinds.has('must_find')).toBe(true);
    expect(kinds.has('must_not_flag')).toBe(true);
  });

  it('seeds >= 3 back-dated batches across 3–7 versions (AC-26)', async () => {
    const batches = await pg.handle.db
      .select()
      .from(t.evalBatches)
      .where(and(eq(t.evalBatches.ownerKind, 'agent'), eq(t.evalBatches.ownerId, agentId)));
    expect(batches.length).toBeGreaterThanOrEqual(3);
    expect(batches.length).toBe(GOLDSET_VERSIONS.length);

    // ran_at is spread over time, not all `now` — distinct dates per version.
    const days = new Set(batches.map((b) => b.ranAt.toISOString().slice(0, 10)));
    expect(days.size).toBe(GOLDSET_VERSIONS.length);
  });

  it('every seeded batch metric equals scoreBatch() over the fixtures (AC-26)', async () => {
    const batches = await pg.handle.db
      .select()
      .from(t.evalBatches)
      .where(and(eq(t.evalBatches.ownerKind, 'agent'), eq(t.evalBatches.ownerId, agentId)));

    for (const v of GOLDSET_VERSIONS) {
      const row = batches.find((b) => b.agentVersion === v.version);
      expect(row, `batch for version ${v.version}`).toBeDefined();
      const expected = scoreBatch(goldsetBatchInputs(v.version));

      expect(row!.recall).toBeCloseTo(expected.recall, 10);
      expect(row!.precision).toBeCloseTo(expected.precision, 10);
      expect(row!.citationAccuracy).toBeCloseTo(expected.citation_accuracy, 10);
      expect(row!.passRate).toBeCloseTo(expected.pass_rate, 10);
      expect(row!.tracesPassed).toBe(expected.traces_passed);
      expect(row!.tracesTotal).toBe(expected.traces_total);
    }
  });

  it('the trend rises: recall of the last version exceeds the first (AC-26)', async () => {
    const first = scoreBatch(goldsetBatchInputs(GOLDSET_VERSIONS[0]!.version)).recall;
    const last = scoreBatch(
      goldsetBatchInputs(GOLDSET_VERSIONS[GOLDSET_VERSIONS.length - 1]!.version),
    ).recall;
    expect(last).toBeGreaterThan(first);
  });

  it('the stable case reads 5/5 and the flaky case ~2/5 over the pinned window (AC-17)', async () => {
    const rows = await makeService().listCases(workspaceId, 'agent', agentId);
    const stable = rows.find((r) => r.name === GOLDSET_STABLE_CASE);
    const flaky = rows.find((r) => r.name === GOLDSET_FLAKY_CASE);

    expect(stable?.repro?.passed).toBe(5);
    expect(stable?.repro?.total).toBe(5);
    expect(stable?.repro?.reliable).toBe(true);

    expect(flaky?.repro?.passed).toBe(2);
    expect(flaky?.repro?.total).toBe(5);
    expect(flaky?.repro?.reliable).toBe(false);
  });

  it('re-seeding is idempotent — no duplicate cases or batches (AC-26)', async () => {
    await seed(pg.handle.db);

    const cases = await pg.handle.db
      .select()
      .from(t.evalCases)
      .where(and(eq(t.evalCases.ownerKind, 'agent'), eq(t.evalCases.ownerId, agentId)));
    const batches = await pg.handle.db
      .select()
      .from(t.evalBatches)
      .where(and(eq(t.evalBatches.ownerKind, 'agent'), eq(t.evalBatches.ownerId, agentId)));

    expect(cases.length).toBe(GOLDSET_CASES.length);
    expect(batches.length).toBe(GOLDSET_VERSIONS.length);
  });
});
