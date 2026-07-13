import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { eq } from 'drizzle-orm';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';
import { seed } from '../src/db/seed.js';
import { MockGitClient, MockGitHubClient, MockLLMProvider } from '../src/adapters/mocks.js';
import * as t from '../src/db/schema.js';

/**
 * The Intent Layer, end to end through the two new routes on `modules/reviews`.
 *
 * DB-backed on purpose: `is_stale` is computed on READ by comparing
 * `pr_intent.head_sha` against the PR's CURRENT `pull_requests.head_sha`, and the
 * token receipt (`tokens_full` / `tokens_headers`) is written by the upsert. Both
 * live in SQL + wiring, so a hermetic unit test could not fail for the right reason.
 *
 * The LLM is a `MockLLMProvider` injected via `ContainerOverrides`, and its fixture
 * is validated against the REAL `IntentExtraction` Zod schema by the mock itself —
 * a contract drift in the service fails here rather than in production.
 */

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

const config = () => loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv);

/** A real diff WITH `+/-` bodies — the headers-only saving must be measurable. */
const DIFF = `diff --git a/src/middleware/rate-limit.ts b/src/middleware/rate-limit.ts
--- a/src/middleware/rate-limit.ts
+++ b/src/middleware/rate-limit.ts
@@ -10,5 +10,8 @@
 export function rateLimit(app) {
-  const bucket = new Map();
+  const bucket = new TokenBucket({ capacity: 60, refillPerSec: 1 });
+  const adminBypassToken = "sk_live_do_not_leak_me";
+  app.decorate("rateLimit", bucket);
   return bucket;
 }
@@ -40,3 +43,4 @@
 const routes = [];
+routes.push("/public/webhooks");
 export default routes;`;

/** What the classifier returns. Validated against the service's own Zod schema. */
const INTENT_FIXTURE = {
  intent: 'Rate-limit the public router with a token bucket.',
  in_scope: ['public router middleware', 'token bucket'],
  out_of_scope: ['internal router'],
  risk_areas: ['Public API surface'],
};

let repoSeq = 0;
async function setupRepoAndPr(db: PgFixture['handle']['db'], workspaceId: string, headSha: string) {
  const name = `payments-api-intent-${repoSeq++}`;
  const [repo] = await db
    .insert(t.repos)
    .values({ workspaceId, owner: 'acme', name, fullName: `acme/${name}` })
    .returning();
  const [pr] = await db
    .insert(t.pullRequests)
    .values({
      workspaceId,
      repoId: repo!.id,
      number: 482,
      title: 'Add rate limiting to the public router',
      author: 'marisa.koch',
      branch: 'feat/rate-limit-public',
      base: 'main',
      headSha,
      additions: 4,
      deletions: 1,
      filesCount: 1,
      status: 'needs_review',
      body: 'Adds a token bucket on the public router. Fixes #471.',
    })
    .returning();
  await db.insert(t.prCommits).values([
    { prId: pr!.id, sha: 'c1', message: 'add token bucket', author: 'marisa.koch' },
    { prId: pr!.id, sha: 'c2', message: 'wire bucket into public router', author: 'marisa.koch' },
  ]);
  return { repo: repo!, pr: pr! };
}

d('Intent Layer routes (Testcontainers pg)', () => {
  let pg: PgFixture;
  let workspaceId: string;

  beforeAll(async () => {
    pg = await startPg();
    await seed(pg.handle.db);
    const [ws] = await pg.handle.db.select().from(t.workspaces);
    workspaceId = ws!.id;
  });
  afterAll(async () => {
    await pg?.stop();
  });

  /** `review_intent` resolves to openrouter by default → that's the key we inject on. */
  function appWithMockLlm() {
    return buildApp({
      config: config(),
      db: pg.handle.db,
      overrides: {
        git: new MockGitClient({ diff: DIFF }),
        github: new MockGitHubClient(),
        llm: {
          openrouter: new MockLLMProvider('openai', {
            structuredBySchema: { IntentExtraction: INTENT_FIXTURE },
          }),
        },
      },
    });
  }

  it('POST then GET /pulls/:id/intent round-trips the stored record, with a real token receipt', async () => {
    const app = await appWithMockLlm();
    const { pr } = await setupRepoAndPr(pg.handle.db, workspaceId, 'aaa111');

    const post = await app.inject({ method: 'POST', url: `/pulls/${pr.id}/intent`, payload: {} });
    expect(post.statusCode).toBe(200);
    const computed = post.json();
    expect(computed.intent).toBe(INTENT_FIXTURE.intent);

    const get = await app.inject({ method: 'GET', url: `/pulls/${pr.id}/intent` });
    expect(get.statusCode).toBe(200);
    const record = get.json();

    // The persisted record, read back by pr_id.
    expect(record.pr_id).toBe(pr.id);
    expect(record.intent).toBe(INTENT_FIXTURE.intent);
    expect(record.in_scope).toEqual(INTENT_FIXTURE.in_scope);
    expect(record.out_of_scope).toEqual(INTENT_FIXTURE.out_of_scope);
    expect(record.risk_areas).toEqual(INTENT_FIXTURE.risk_areas);

    // Provenance: the head it was derived from, and the model that derived it.
    expect(record.head_sha).toBe('aaa111');
    expect(record.provider).toBe('openrouter');
    expect(typeof record.model).toBe('string');
    expect(record.computed_at).toBeTruthy();

    // The source ladder is visible, including the rungs that fired on a described PR.
    expect(record.derived_from).toEqual(
      expect.arrayContaining(['pr_body', 'issue #471', 'title', 'branch', 'commits', 'files']),
    );

    // THE HEADLINE CLAIM: the full diff (with `+/-` bodies) would have cost
    // meaningfully more than the headers-only rendering we actually sent.
    expect(record.tokens_full).toBeGreaterThan(0);
    expect(record.tokens_headers).toBeGreaterThan(0);
    expect(record.tokens_headers).toBeLessThan(record.tokens_full);
    expect(record.tokens_headers).toBeLessThan(record.tokens_full / 2);

    // Freshly computed against the current head ⇒ not stale.
    expect(record.is_stale).toBe(false);

    await app.close();
  });

  it('is_stale is computed on READ: moving the PR head makes the stored intent stale', async () => {
    const app = await appWithMockLlm();
    const { pr } = await setupRepoAndPr(pg.handle.db, workspaceId, 'aaa111');

    await app.inject({ method: 'POST', url: `/pulls/${pr.id}/intent`, payload: {} });
    expect((await app.inject({ method: 'GET', url: `/pulls/${pr.id}/intent` })).json().is_stale).toBe(
      false,
    );

    // The author pushes a commit: the PR's head moves, the intent's does not.
    await pg.handle.db
      .update(t.pullRequests)
      .set({ headSha: 'bbb222' })
      .where(eq(t.pullRequests.id, pr.id));

    const stale = (await app.inject({ method: 'GET', url: `/pulls/${pr.id}/intent` })).json();
    expect(stale.is_stale).toBe(true);
    // Derived, never stored: the row still carries the sha it was computed at.
    expect(stale.head_sha).toBe('aaa111');
    const [row] = await pg.handle.db.select().from(t.prIntent).where(eq(t.prIntent.prId, pr.id));
    expect(row!.headSha).toBe('aaa111');
    expect(row).not.toHaveProperty('isStale');

    await app.close();
  });

  it('GET for a PR that has never been computed returns null — not a 500', async () => {
    const app = await appWithMockLlm();
    const { pr } = await setupRepoAndPr(pg.handle.db, workspaceId, 'aaa111');

    const res = await app.inject({ method: 'GET', url: `/pulls/${pr.id}/intent` });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toBeNull();

    await app.close();
  });

  it('404s for a PR that does not exist (GET and POST), rather than inventing an intent', async () => {
    const app = await appWithMockLlm();
    const ghost = '00000000-0000-4000-8000-000000000000';

    expect((await app.inject({ method: 'GET', url: `/pulls/${ghost}/intent` })).statusCode).toBe(404);
    const post = await app.inject({ method: 'POST', url: `/pulls/${ghost}/intent`, payload: {} });
    expect(post.statusCode).toBe(404);

    await app.close();
  });

  it('the BUTTON stays unconditional: POST recomputes even when an intent already exists', async () => {
    // The auto-fill job skips a PR that already has an intent (`computeIfMissing`).
    // The button must NOT inherit that guard — being unconditional is the entire
    // point of a "recompute" button, and it is the only way to refresh a stale intent.
    const llm = new MockLLMProvider('openai', {
      structuredBySchema: { IntentExtraction: INTENT_FIXTURE },
    });
    const app = await buildApp({
      config: config(),
      db: pg.handle.db,
      overrides: {
        git: new MockGitClient({ diff: DIFF }),
        github: new MockGitHubClient(),
        llm: { openrouter: llm },
      },
    });
    const { pr } = await setupRepoAndPr(pg.handle.db, workspaceId, 'aaa111');
    const modelCalls = () => llm.calls.filter((c) => c.method === 'completeStructured').length;

    expect((await app.inject({ method: 'POST', url: `/pulls/${pr.id}/intent`, payload: {} })).statusCode).toBe(200);
    expect(modelCalls()).toBe(1);

    // Same PR, same head, intent already stored — the button still pays for a call.
    expect((await app.inject({ method: 'POST', url: `/pulls/${pr.id}/intent`, payload: {} })).statusCode).toBe(200);
    expect(modelCalls()).toBe(2);

    await app.close();
  });

  it('recomputing UPSERTs the same row and restamps it with the new head', async () => {
    const app = await appWithMockLlm();
    const { pr } = await setupRepoAndPr(pg.handle.db, workspaceId, 'aaa111');

    await app.inject({ method: 'POST', url: `/pulls/${pr.id}/intent`, payload: {} });
    await pg.handle.db
      .update(t.pullRequests)
      .set({ headSha: 'bbb222' })
      .where(eq(t.pullRequests.id, pr.id));
    const again = await app.inject({ method: 'POST', url: `/pulls/${pr.id}/intent`, payload: {} });

    expect(again.statusCode).toBe(200);
    expect(again.json().head_sha).toBe('bbb222');
    expect(again.json().is_stale).toBe(false);

    // One intent per PR — the recompute updated the row, it did not append one.
    const rows = await pg.handle.db.select().from(t.prIntent).where(eq(t.prIntent.prId, pr.id));
    expect(rows).toHaveLength(1);

    await app.close();
  });
});
