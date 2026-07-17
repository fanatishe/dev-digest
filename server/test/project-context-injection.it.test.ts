import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { waitForPrRuns } from './helpers/runs.js';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';
import { seed } from '../src/db/seed.js';
import { MockLLMProvider, MockEmbedder, MockGitClient } from '../src/adapters/mocks.js';
import type { Tokenizer } from '../src/adapters/tokenizer/index.js';
import * as t from '../src/db/schema.js';
import { eq } from 'drizzle-orm';
import type { Review, RunTrace } from '@devdigest/shared';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

/** Deterministic token counter: one token per whitespace-delimited word. Lets
 *  the budget tests assert exact accept/drop boundaries without depending on the
 *  real BPE encoder. */
const wordCount: Tokenizer = { count: (s: string) => s.split(/\s+/).filter(Boolean).length };

const baseConfig = () => loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv);
const configWithBudget = (budget: number) =>
  loadConfig({
    ...process.env,
    NODE_ENV: 'test',
    DEVDIGEST_PROJECT_CONTEXT_TOKEN_BUDGET: String(budget),
  } as NodeJS.ProcessEnv);

const DIFF = `diff --git a/src/config.ts b/src/config.ts
--- a/src/config.ts
+++ b/src/config.ts
@@ -10,3 +10,4 @@
   port: 3000,
+  stripeKey: "sk_live_xxx",
   redisUrl: x,`;

const REVIEW_FIXTURE: Review = {
  verdict: 'request_changes',
  summary: 'Hardcoded Stripe secret introduced.',
  score: 42,
  findings: [
    {
      id: 'f-valid',
      severity: 'CRITICAL',
      category: 'security',
      title: 'Hardcoded Stripe secret key',
      file: 'src/config.ts',
      start_line: 11,
      end_line: 11,
      rationale: 'A live Stripe key is committed in source.',
      suggestion: 'Move the key to an environment variable.',
      confidence: 0.95,
      kind: 'finding',
    },
  ],
};

let repoSeq = 0;
async function setupRepoAndPr(
  db: PgFixture['handle']['db'],
  workspaceId: string,
  clonePath: string,
) {
  const name = `ctx-inj-${repoSeq++}`;
  const [repo] = await db
    .insert(t.repos)
    .values({ workspaceId, owner: 'acme', name, fullName: `acme/${name}`, clonePath })
    .returning();
  const [pr] = await db
    .insert(t.pullRequests)
    .values({
      workspaceId,
      repoId: repo!.id,
      number: 482,
      title: 'Add rate limiting',
      author: 'marisa.koch',
      branch: 'feat/rl',
      base: 'main',
      headSha: 'a1b2c3d4',
      additions: 1,
      deletions: 0,
      filesCount: 1,
      status: 'needs_review',
      body: 'Add rate limiting.',
    })
    .returning();
  await db.insert(t.prFiles).values({
    prId: pr!.id,
    path: 'src/config.ts',
    additions: 1,
    deletions: 0,
    patch: '@@ -10,3 +10,4 @@\n   port: 3000,\n+  stripeKey: "sk_live_xxx",\n   redisUrl: x,',
  });
  return { repo: repo!, pr: pr! };
}

async function writeClone(files: Record<string, string>): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'devdigest-ctx-'));
  for (const [rel, body] of Object.entries(files)) {
    const abs = join(dir, rel);
    await mkdir(dirname(abs), { recursive: true });
    await writeFile(abs, body, 'utf8');
  }
  return dir;
}

d('Project-context review-time injection (WP-D · Testcontainers pg)', () => {
  let pg: PgFixture;
  let workspaceId: string;
  const clones: string[] = [];

  beforeAll(async () => {
    pg = await startPg();
    await seed(pg.handle.db);
    const [ws] = await pg.handle.db.select().from(t.workspaces);
    workspaceId = ws!.id;
  });
  afterAll(async () => {
    await Promise.all(clones.map((c) => rm(c, { recursive: true, force: true }).catch(() => undefined)));
    await pg?.stop();
  });

  function appWith(config = baseConfig(), llm = new MockLLMProvider('openai', { structured: REVIEW_FIXTURE })) {
    return buildApp({
      config,
      db: pg.handle.db,
      overrides: {
        embedder: new MockEmbedder(),
        git: new MockGitClient({ diff: DIFF }),
        tokenizer: wordCount,
        llm: { openai: llm },
      },
    });
  }

  async function makeAgent(app: Awaited<ReturnType<typeof appWith>>, name: string): Promise<string> {
    const agent = (
      await app.inject({
        method: 'POST',
        url: '/agents',
        payload: { name, provider: 'openai', model: 'gpt-4.1', system_prompt: 'sec' },
      })
    ).json();
    return agent.id as string;
  }

  const attach = (agentId: string, paths: string[]) =>
    pg.handle.db.update(t.agents).set({ contextDocs: paths }).where(eq(t.agents.id, agentId));

  async function runAndTrace(
    app: Awaited<ReturnType<typeof appWith>>,
    prId: string,
    agentId: string,
    expected: number,
  ): Promise<{ runId: string; trace: RunTrace; status: string }> {
    const body = (
      await app.inject({ method: 'POST', url: `/pulls/${prId}/review`, payload: { agentId } })
    ).json();
    const runId = body.runs[0].run_id as string;
    await waitForPrRuns(pg.handle.db, prId, { expected });
    const trace = (await app.inject({ method: 'GET', url: `/runs/${runId}/trace` })).json() as RunTrace;
    const [run] = await pg.handle.db.select().from(t.agentRuns).where(eq(t.agentRuns.id, runId));
    return { runId, trace, status: run!.status ?? '' };
  }

  it('AC-13 — a missing attached path injects no chunk, is recorded not_found, and the run still completes', async () => {
    const clone = await writeClone({ 'specs/present.md': 'this doc exists' });
    clones.push(clone);
    const app = await appWith();
    const { pr } = await setupRepoAndPr(pg.handle.db, workspaceId, clone);
    const agentId = await makeAgent(app, 'MissingDoc');
    await attach(agentId, ['docs/does-not-exist.md']);

    const { trace, status } = await runAndTrace(app, pr.id, agentId, 1);

    expect(status).toBe('done');
    expect(trace.specs_read).toEqual([]);
    expect(trace.prompt_assembly.specs).toBeNull();
    expect(trace.specs_skipped).toEqual([{ path: 'docs/does-not-exist.md', reason: 'not_found' }]);
    await app.close();
  });

  it('AC-14 — a traversal path (../../etc/passwd) is rejected by the guard: nothing read, recorded unsafe', async () => {
    const clone = await writeClone({ 'specs/present.md': 'this doc exists' });
    clones.push(clone);
    const app = await appWith();
    const { pr } = await setupRepoAndPr(pg.handle.db, workspaceId, clone);
    const agentId = await makeAgent(app, 'TraversalDoc');
    await attach(agentId, ['../../etc/passwd']);

    const { trace, status } = await runAndTrace(app, pr.id, agentId, 1);

    expect(status).toBe('done');
    expect(trace.specs_read).toEqual([]);
    expect(trace.prompt_assembly.specs).toBeNull();
    // `unsafe` (not `not_found`) proves the isSafeRepoPath guard fired BEFORE any
    // filesystem read was attempted — the load-bearing AC-14 seam.
    expect(trace.specs_skipped).toEqual([{ path: '../../etc/passwd', reason: 'unsafe' }]);
    await app.close();
  });

  it('AC-15 — cumulative budget crossing drops the remainder whole, warns in the log, and records over_budget', async () => {
    const clone = await writeClone({
      'specs/a.md': 'one two three four five', // 5 tokens
      'specs/b.md': 'six seven eight nine ten', // 5 tokens
      'specs/c.md': 'eleven twelve thirteen fourteen fifteen', // 5 tokens
    });
    clones.push(clone);
    // Budget 8: a fits (5 ≤ 8); a+b = 10 > 8 → b and c dropped whole.
    const app = await appWith(configWithBudget(8));
    const { pr } = await setupRepoAndPr(pg.handle.db, workspaceId, clone);
    const agentId = await makeAgent(app, 'BudgetDoc');
    await attach(agentId, ['specs/a.md', 'specs/b.md', 'specs/c.md']);

    const { trace, status } = await runAndTrace(app, pr.id, agentId, 1);

    expect(status).toBe('done');
    expect(trace.specs_read).toEqual(['specs/a.md']);
    expect(trace.specs_skipped).toEqual([
      { path: 'specs/b.md', reason: 'over_budget' },
      { path: 'specs/c.md', reason: 'over_budget' },
    ]);
    // Only the accepted doc's body is in the rendered block.
    expect(trace.prompt_assembly.specs).toContain('### specs/a.md');
    expect(trace.prompt_assembly.specs).not.toContain('### specs/b.md');
    // A budget warn line was surfaced in the Live Log.
    expect(trace.log.some((l) => /budget/i.test(l.msg))).toBe(true);
    await app.close();
  });

  it('AC-8 (injection half) — reordering the attached list reorders the injected specs', async () => {
    const clone = await writeClone({
      'specs/a.md': 'alpha doc body',
      'specs/b.md': 'beta doc body',
    });
    clones.push(clone);
    const app = await appWith(configWithBudget(1000));
    const { pr } = await setupRepoAndPr(pg.handle.db, workspaceId, clone);
    const agentId = await makeAgent(app, 'ReorderDoc');

    await attach(agentId, ['specs/a.md', 'specs/b.md']);
    const first = await runAndTrace(app, pr.id, agentId, 1);
    expect(first.trace.specs_read).toEqual(['specs/a.md', 'specs/b.md']);

    await attach(agentId, ['specs/b.md', 'specs/a.md']);
    const second = await runAndTrace(app, pr.id, agentId, 2);
    expect(second.trace.specs_read).toEqual(['specs/b.md', 'specs/a.md']);
    // The rendered block reflects the new order too.
    const specs = second.trace.prompt_assembly.specs ?? '';
    expect(specs.indexOf('### specs/b.md')).toBeLessThan(specs.indexOf('### specs/a.md'));
    await app.close();
  });

  it('AC-19 / AC-20 — injecting a doc adds NO model call; specs_read + specs_tokens are persisted', async () => {
    const clone = await writeClone({ 'docs/context.md': 'attached project context body here' });
    clones.push(clone);
    const llm = new MockLLMProvider('openai', { structured: REVIEW_FIXTURE });
    const app = await appWith(configWithBudget(1000), llm);
    const { pr: prPlain } = await setupRepoAndPr(pg.handle.db, workspaceId, clone);
    const { pr: prDocs } = await setupRepoAndPr(pg.handle.db, workspaceId, clone);

    const calls = () => llm.calls.filter((c) => c.method === 'completeStructured').length;

    // Review with NO attached docs — one model call for the review itself.
    const agentPlain = await makeAgent(app, 'PlainAgent');
    const before = calls();
    const plain = await runAndTrace(app, prPlain.id, agentPlain, 1);
    const afterPlain = calls();
    expect(afterPlain - before).toBe(1);
    expect(plain.trace.specs_read).toEqual([]);
    expect(plain.trace.prompt_assembly.specs).toBeNull();

    // Review WITH an attached doc — still exactly one model call (AC-19).
    const agentDocs = await makeAgent(app, 'DocsAgent');
    await attach(agentDocs, ['docs/context.md']);
    const docs = await runAndTrace(app, prDocs.id, agentDocs, 1);
    const afterDocs = calls();
    expect(afterDocs - afterPlain).toBe(1);

    // AC-20 — the injected paths and the block's token sum are on the trace.
    expect(docs.status).toBe('done');
    expect(docs.trace.specs_read).toEqual(['docs/context.md']);
    const specsBlock = docs.trace.prompt_assembly.specs ?? '';
    expect(specsBlock).toContain('### docs/context.md');
    expect(docs.trace.stats.specs_tokens).toBe(wordCount.count(specsBlock));
    expect(docs.trace.stats.specs_tokens).toBeGreaterThan(0);
    await app.close();
  });
});
