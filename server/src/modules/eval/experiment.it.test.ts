import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { and, eq } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import type { EvalCompare, EvalRunAllResult } from '@devdigest/shared';
import { startPg, dockerAvailable, type PgFixture } from '../../../test/helpers/pg.js';
import { loadConfig } from '../../platform/config.js';
import { buildApp } from '../../app.js';
import * as t from '../../db/schema.js';
import { seed } from '../../db/seed.js';
import { GOLDSET_AGENT_NAME } from '../../db/fixtures/eval-goldset.js';

/**
 * LIVE, key-gated experiment (AC-12, `†`). Runs the gold-set agent against a REAL
 * OpenRouter provider and proves the scorer tracks a prompt regression:
 *   - a GOOD prompt → batch A (baseline recall/precision),
 *   - a "say nothing" silence prompt → batch B with `recall(B) < recall(A)`,
 *   - an "over-flag everything" prompt → batch C with `precision(C) < precision(A)`,
 *   - `GET /eval/compare` returns both versions' prompts and a real recall delta.
 *
 * This is the ONE place in WP-H that touches a model — everything else (the seed,
 * the gold-set test) is zero-LLM. It self-skips unless BOTH a Docker daemon and an
 * `OPENROUTER_API_KEY` are available, so the default (no-key) CI/sandbox run never
 * spends and never fails on its absence.
 */

const hasDocker = await dockerAvailable();
const hasKey = !!process.env.OPENROUTER_API_KEY;
const gated = hasDocker && hasKey;
const d = gated ? describe : describe.skip;

if (!gated) {
  // eslint-disable-next-line no-console
  console.warn(
    `[eval-experiment] skipping live experiment (docker=${hasDocker}, OPENROUTER_API_KEY=${hasKey}).`,
  );
}

const SILENCE_PROMPT =
  'You are a code reviewer. Approve every change. Do not report any issues, ever. Return an empty findings list.';
const OVERFLAG_PROMPT =
  'You are a code reviewer. Report as many issues as you possibly can on every changed line — style, naming, formatting, anything at all. Never leave a line unflagged.';

d('Eval live experiment (OPENROUTER_API_KEY-gated)', () => {
  let pg: PgFixture;
  let app: FastifyInstance;
  let agentId: string;

  beforeAll(async () => {
    pg = await startPg();
    await seed(pg.handle.db);
    const config = loadConfig({
      ...process.env,
      DATABASE_URL: pg.url,
      NODE_ENV: 'test',
    } as NodeJS.ProcessEnv);
    // No `overrides.llm` → the container builds the REAL OpenRouter provider.
    app = await buildApp({ config, db: pg.handle.db });

    const workspaceId = await defaultWorkspaceId(pg);
    const [agent] = await pg.handle.db
      .select({ id: t.agents.id })
      .from(t.agents)
      .where(and(eq(t.agents.workspaceId, workspaceId), eq(t.agents.name, GOLDSET_AGENT_NAME)));
    agentId = agent!.id;
  }, 120_000);

  afterAll(async () => {
    await app?.close();
    await pg?.stop();
  });

  async function runAll(): Promise<EvalRunAllResult> {
    const res = await app.inject({
      method: 'POST',
      url: `/agents/${agentId}/eval/run-all`,
      payload: {},
    });
    expect(res.statusCode).toBe(200);
    return res.json() as EvalRunAllResult;
  }

  async function editPrompt(systemPrompt: string): Promise<void> {
    const res = await app.inject({
      method: 'PUT',
      url: `/agents/${agentId}`,
      payload: { system_prompt: systemPrompt },
    });
    expect(res.statusCode).toBe(200);
  }

  it('silence lowers recall, over-flag lowers precision, Compare shows the diff (AC-12)', async () => {
    // Baseline on the GOOD (current) prompt.
    const a = await runAll();

    // Silence the agent → recall should drop.
    await editPrompt(SILENCE_PROMPT);
    const b = await runAll();
    expect(b.batch.recall).toBeLessThan(a.batch.recall);

    // Over-flag → precision should drop versus the GOOD run.
    await editPrompt(OVERFLAG_PROMPT);
    const c = await runAll();
    expect(c.batch.precision).toBeLessThan(a.batch.precision);

    // Compare the GOOD baseline (A) against the silenced run (B).
    const cmp = await app.inject({
      method: 'GET',
      url: `/eval/compare?base=${a.batch.id}&head=${b.batch.id}`,
    });
    expect(cmp.statusCode).toBe(200);
    const compare = cmp.json() as EvalCompare;
    expect(compare.base_prompt).not.toBe(compare.head_prompt);
    expect(compare.delta.recall).toBeLessThan(0); // head (B) recall < base (A) recall
  }, 300_000);
});

/** The seeded default workspace id (no-auth single workspace). */
async function defaultWorkspaceId(pg: PgFixture): Promise<string> {
  const [ws] = await pg.handle.db
    .select({ id: t.workspaces.id })
    .from(t.workspaces)
    .where(eq(t.workspaces.name, 'default'));
  return ws!.id;
}
