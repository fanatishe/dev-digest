import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { eq } from 'drizzle-orm';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';
import { seed } from '../src/db/seed.js';
import {
  MockGitClient,
  MockGitHubClient,
  MockLLMProvider,
  type MockLLMOptions,
} from '../src/adapters/mocks.js';
import type { StructuredRequest, StructuredResult } from '@devdigest/shared';
import { INTENT_JOB_KIND } from '../src/modules/reviews/constants.js';
import { INTENT_ENQUEUE_LIMIT, IntentJobPayload } from '../src/modules/pulls/constants.js';
import * as t from '../src/db/schema.js';

/**
 * Intent AUTO-FILL — the background job, its freshness guard, and its cost receipt.
 *
 * DB-backed on purpose. Both load-bearing behaviours are only true in SQL:
 *   - the guard reads `pr_intent` by PK and must make NO model call when a row is
 *     there — asserted on the MOCK ADAPTER's call count, not on a return value, so
 *     a guard that "returned the right thing" while still paying for a call fails;
 *   - the receipt (`tokens_in` / `tokens_out` / `cost_usd`) is written by the upsert.
 *
 * The job is driven through the REAL `container.jobs.enqueue(...)` rather than by
 * calling the service directly, so the registration in `reviews/routes.ts` is under
 * test too: `JobRunner.enqueue` THROWS when a kind has no handler, and `pulls`
 * enqueues this kind.
 *
 * Two mock-injection landmines (see server/INSIGHTS.md, 2026-07-12):
 *   1. `review_intent` resolves to the OPENROUTER provider — injecting the mock on
 *      the `openai` key silently falls through to a REAL provider and dies on a
 *      missing key. Inject on `llm: { openrouter: … }`.
 *   2. A `Fixes #NNN` in the PR body makes `container.github()` resolve a REAL token
 *      and hit the network — and the service's best-effort try/catch HIDES it.
 *      Inject `github: new MockGitHubClient()`.
 */

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

const config = () => loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv);

const DIFF = `diff --git a/src/middleware/rate-limit.ts b/src/middleware/rate-limit.ts
--- a/src/middleware/rate-limit.ts
+++ b/src/middleware/rate-limit.ts
@@ -10,5 +10,8 @@
 export function rateLimit(app) {
-  const bucket = new Map();
+  const bucket = new TokenBucket({ capacity: 60, refillPerSec: 1 });
   return bucket;
 }`;

const INTENT_FIXTURE = {
  intent: 'Rate-limit the public router with a token bucket.',
  in_scope: ['public router middleware'],
  out_of_scope: [],
  risk_areas: ['Public API surface'],
};

/** Model calls only — `listModels`/`embed` are not spend on the intent path. */
const modelCalls = (llm: MockLLMProvider) =>
  llm.calls.filter((c) => c.method === 'completeStructured').length;

/**
 * The canonical mock LLM, with the model call HELD OPEN until `release()`.
 *
 * Not a new mock: it extends `MockLLMProvider` (same fixtures, same call log, same
 * receipt) and only adds a latch. Needed because the in-flight dedupe can only be
 * observed while jobs are actually in flight — with the instant mock, a job can
 * land (and write its `pr_intent` row) before the second read runs, at which point
 * the MISSING-row guard would cover for a missing in-flight guard and the
 * regression test would pass even with the dedupe reverted.
 *
 * It delays the BOUNDARY we don't control (the LLM port). Nothing under test —
 * the route, the JobRunner, the repositories — is mocked or stubbed.
 */
class GatedLLMProvider extends MockLLMProvider {
  private open!: () => void;
  private gate = new Promise<void>((resolve) => {
    this.open = resolve;
  });

  constructor(opts: MockLLMOptions = {}) {
    super('openai', opts);
  }

  override async completeStructured<T>(req: StructuredRequest<T>): Promise<StructuredResult<T>> {
    await this.gate;
    return super.completeStructured(req);
  }

  /** Let every held call through. */
  release(): void {
    this.open();
  }
}

let repoSeq = 0;
async function setupPr(db: PgFixture['handle']['db'], workspaceId: string) {
  const name = `payments-api-autofill-${repoSeq++}`;
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
      headSha: 'aaa111',
      additions: 4,
      deletions: 1,
      filesCount: 1,
      status: 'needs_review',
      // The `Fixes #471` landmine: without MockGitHubClient this reaches the network.
      body: 'Adds a token bucket on the public router. Fixes #471.',
    })
    .returning();
  return { repo: repo!, pr: pr! };
}

d('Intent auto-fill job (Testcontainers pg)', () => {
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

  /** The app + the exact mock LLM instance it was built with, so we can count calls. */
  async function appWithSpy() {
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
    return { app, llm };
  }

  it('THE GUARD: a PR that already has an intent is skipped — zero model calls', async () => {
    const { app, llm } = await appWithSpy();
    const { pr } = await setupPr(pg.handle.db, workspaceId);

    // An intent already exists (however it got there — button, or an earlier job).
    await pg.handle.db.insert(t.prIntent).values({
      prId: pr.id,
      intent: 'A pre-existing intent.',
      headSha: 'aaa111',
      provider: 'openrouter',
      model: 'preexisting-model',
    });

    const job = await app.container.jobs.enqueue(workspaceId, INTENT_JOB_KIND, { prId: pr.id });
    await job.done;

    // The load-bearing assertion of this WP: the guard did not pay for a call.
    expect(modelCalls(llm)).toBe(0);

    // …and it did not overwrite the row it found, either.
    const [row] = await pg.handle.db.select().from(t.prIntent).where(eq(t.prIntent.prId, pr.id));
    expect(row!.intent).toBe('A pre-existing intent.');
    expect(row!.model).toBe('preexisting-model');

    await app.close();
  });

  it('A STALE intent is NOT auto-recomputed — the head moving is the button\'s job', async () => {
    const { app, llm } = await appWithSpy();
    const { pr } = await setupPr(pg.handle.db, workspaceId);

    await pg.handle.db.insert(t.prIntent).values({
      prId: pr.id,
      intent: 'Derived at an older head.',
      headSha: 'aaa111',
    });
    // The author pushes: the PR's head moves, the intent's does not ⇒ is_stale.
    await pg.handle.db
      .update(t.pullRequests)
      .set({ headSha: 'bbb222' })
      .where(eq(t.pullRequests.id, pr.id));

    const job = await app.container.jobs.enqueue(workspaceId, INTENT_JOB_KIND, { prId: pr.id });
    await job.done;

    // MISSING-only, not stale-also: a stale intent must keep its stale badge and
    // wait for a human, or the badge and the recompute button mean nothing.
    expect(modelCalls(llm)).toBe(0);
    const [row] = await pg.handle.db.select().from(t.prIntent).where(eq(t.prIntent.prId, pr.id));
    expect(row!.intent).toBe('Derived at an older head.');
    expect(row!.headSha).toBe('aaa111');

    const record = (await app.inject({ method: 'GET', url: `/pulls/${pr.id}/intent` })).json();
    expect(record.is_stale).toBe(true);

    await app.close();
  });

  it('THE COST: an auto-filled intent persists the token + cost receipt', async () => {
    const { app, llm } = await appWithSpy();
    const { pr } = await setupPr(pg.handle.db, workspaceId);

    const job = await app.container.jobs.enqueue(workspaceId, INTENT_JOB_KIND, { prId: pr.id });
    await job.done;

    expect(modelCalls(llm)).toBe(1);

    const [row] = await pg.handle.db.select().from(t.prIntent).where(eq(t.prIntent.prId, pr.id));
    expect(row!.intent).toBe(INTENT_FIXTURE.intent);

    // Spend nobody clicked for still leaves a receipt: what the PROVIDER billed
    // (MockLLMProvider reports 100 / 50 / $0.001), not our tokenizer's count.
    expect(row!.tokensIn).toBe(100);
    expect(row!.tokensOut).toBe(50);
    expect(row!.costUsd).toBeCloseTo(0.001, 5);

    // Distinct from the headers-only receipt, which is still written.
    expect(row!.tokensFull).toBeGreaterThan(0);
    expect(row!.tokensHeaders).toBeGreaterThan(0);

    // And it round-trips onto the contract the client reads.
    const record = (await app.inject({ method: 'GET', url: `/pulls/${pr.id}/intent` })).json();
    expect(record.tokens_in).toBe(100);
    expect(record.tokens_out).toBe(50);
    expect(record.cost_usd).toBeCloseTo(0.001, 5);
    expect(record.is_stale).toBe(false);

    await app.close();
  });

  it('the job is REGISTERED at plugin boot — enqueue does not throw for the kind', async () => {
    const { app } = await appWithSpy();
    const { pr } = await setupPr(pg.handle.db, workspaceId);

    // `JobRunner.enqueue` throws `No job handler registered for kind …` when the
    // registration in reviews/routes.ts is missing. This is what WP1's PR-list
    // enqueue depends on.
    await expect(
      app.container.jobs.enqueue(workspaceId, INTENT_JOB_KIND, { prId: pr.id }),
    ).resolves.toMatchObject({ id: expect.any(String) });

    // Every attempt is visible in SQL, not just in the log.
    const jobs = await pg.handle.db.select().from(t.jobs).where(eq(t.jobs.kind, INTENT_JOB_KIND));
    expect(jobs.length).toBeGreaterThan(0);

    await app.container.jobs.onIdle();
    await app.close();
  });

  it('a PR that no longer exists is a no-op, not a failed job (and no model call)', async () => {
    const { app, llm } = await appWithSpy();
    const ghost = '00000000-0000-4000-8000-000000000000';

    // A PR can be deleted between enqueue and run. That must not fail the job
    // (JobRunner would retry it twice and then park a `failed` row) and must
    // certainly not compute an intent for a PR nobody can see.
    const job = await app.container.jobs.enqueue(workspaceId, INTENT_JOB_KIND, { prId: ghost });
    await expect(job.done).resolves.toBeUndefined();
    expect(modelCalls(llm)).toBe(0);

    await app.close();
  });
});

/**
 * ---- The ENQUEUE SITE: `GET /repos/:id/pulls` (WP1) -----------------------
 *
 * The suite above tests the JOB. This one tests what DECIDES to pay for it, which
 * is a different (and more expensive to get wrong) thing. Every enqueue here is a
 * billable model call with no human in the loop, on a handler the client POLLS
 * (TanStack Query refetches on window focus), so the three properties below are
 * MONEY properties, not niceties:
 *
 *   1. CAP        — at most `INTENT_ENQUEUE_LIMIT` jobs per request, and none for
 *                   a PR that already has a `pr_intent` row.
 *   2. DEGRADE    — the list still returns 200 when `jobs.enqueue` REJECTS.
 *                   `JobRunner.enqueue` throws `No job handler registered for
 *                   kind '<kind>'`; a PR-list READ must never 500 because a
 *                   background job could not be queued.
 *   3. NO DOUBLE-SPEND — two reads back-to-back, with the first read's jobs still
 *                   IN FLIGHT (`queued` | `running` — the `jobs` status enum has
 *                   no `pending`), must enqueue NOTHING the second time. Without
 *                   the in-flight dedupe this is a re-bill on every poll: no
 *                   `pr_intent` row exists until the job LANDS, so a plain
 *                   missing-row guard re-enqueues the same PR forever.
 *
 * DB-backed because all three are decided by SQL the route runs (`prIdsWithIntent`
 * on `pr_intent`, `JobRunner.pendingPayloads` on `jobs`) — a hermetic unit test
 * would have to mock both, i.e. mock the seam under test.
 */
d('Intent auto-fill enqueue site — GET /repos/:id/pulls (Testcontainers pg)', () => {
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

  /**
   * A repo with `count` PRs, none of which has an intent.
   *
   * `pulls: []` on the mock GitHub client (below) means the route's sync step adds
   * NOTHING — the PR set under test is exactly what is seeded here, so the cap
   * assertion counts what we put in and not what a fixture happened to inject.
   * Non-zero diff stats keep the route's `BACKFILL_LIMIT` detail-fetch loop out of
   * the picture for the same reason.
   */
  async function setupRepoWithPrs(count: number) {
    const db = pg.handle.db;
    const name = `payments-api-list-${repoSeq++}`;
    const [repo] = await db
      .insert(t.repos)
      .values({ workspaceId, owner: 'acme', name, fullName: `acme/${name}` })
      .returning();
    const prs = [];
    for (let i = 0; i < count; i++) {
      const [pr] = await db
        .insert(t.pullRequests)
        .values({
          workspaceId,
          repoId: repo!.id,
          number: 100 + i,
          title: `Add rate limiting to the public router (${i})`,
          author: 'marisa.koch',
          branch: `feat/rate-limit-public-${i}`,
          base: 'main',
          headSha: `sha-${i}`,
          additions: 4,
          deletions: 1,
          filesCount: 1,
          status: 'open',
          body: 'Adds a token bucket on the public router. Fixes #471.',
        })
        .returning();
      prs.push(pr!);
    }
    return { repo: repo!, prs };
  }

  /**
   * The intent jobs that exist for a given set of PRs. `jobs.payload` is free-form
   * jsonb, so it is PARSED with the producer's own Zod contract, never cast — the
   * same contract the route's dedupe reads it back with.
   */
  async function intentJobsFor(prIds: string[]) {
    const rows = await pg.handle.db
      .select()
      .from(t.jobs)
      .where(eq(t.jobs.kind, INTENT_JOB_KIND));
    return rows.filter((r) => {
      const parsed = IntentJobPayload.safeParse(r.payload);
      return parsed.success && prIds.includes(parsed.data.prId);
    });
  }

  async function listApp(llm: MockLLMProvider) {
    return buildApp({
      config: config(),
      db: pg.handle.db,
      overrides: {
        git: new MockGitClient({ diff: DIFF }),
        // `pulls: []` → the GitHub sync imports no extra PRs. The default mock
        // returns one, which would silently become an 11th intent-less candidate.
        github: new MockGitHubClient({ pulls: [] }),
        llm: { openrouter: llm },
      },
    });
  }

  const spyLlm = () =>
    new MockLLMProvider('openai', { structuredBySchema: { IntentExtraction: INTENT_FIXTURE } });

  it('CAP: enqueues at most INTENT_ENQUEUE_LIMIT jobs, and none for a PR that already has an intent', async () => {
    const llm = spyLlm();
    const app = await listApp(llm);
    // 12 intent-less PRs (> the cap) + 1 that already has an intent.
    const { repo, prs } = await setupRepoWithPrs(13);
    const withIntent = prs[0]!;
    await pg.handle.db.insert(t.prIntent).values({
      prId: withIntent.id,
      intent: 'A pre-existing intent.',
      headSha: withIntent.headSha,
      provider: 'openrouter',
      model: 'preexisting-model',
    });
    const intentLess = prs.slice(1).map((p) => p.id);

    const res = await app.inject({ method: 'GET', url: `/repos/${repo.id}/pulls` });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toHaveLength(13);

    const jobs = await intentJobsFor(prs.map((p) => p.id));

    // The cap is load-bearing: it is what bounds automatic spend per request.
    expect(INTENT_ENQUEUE_LIMIT).toBe(10);
    expect(jobs.length).toBeLessThanOrEqual(INTENT_ENQUEUE_LIMIT);
    // 12 candidates, cap 10 → exactly 10 jobs, all of them for intent-less PRs.
    expect(jobs).toHaveLength(10);

    const enqueuedPrIds = jobs.map((j) => IntentJobPayload.parse(j.payload).prId);
    expect(new Set(enqueuedPrIds).size).toBe(10); // no PR enqueued twice
    // …and NOT for the PR that already has an intent.
    expect(enqueuedPrIds).not.toContain(withIntent.id);
    expect(enqueuedPrIds.every((id) => intentLess.includes(id))).toBe(true);

    await app.container.jobs.onIdle();
    await app.close();
  });

  it('DEGRADES: the list still returns 200 when jobs.enqueue THROWS', async () => {
    const llm = spyLlm();
    const app = await listApp(llm);
    const { repo, prs } = await setupRepoWithPrs(2);

    // Exactly what `JobRunner.enqueue` does when a kind has no registered handler
    // (platform/jobs.ts) — e.g. the registration in reviews/routes.ts is dropped.
    const enqueue = vi
      .spyOn(app.container.jobs, 'enqueue')
      .mockRejectedValue(new Error(`No job handler registered for kind '${INTENT_JOB_KIND}'`));

    const res = await app.inject({ method: 'GET', url: `/repos/${repo.id}/pulls` });

    // A READ must not 500 because a BACKGROUND job could not be queued.
    expect(res.statusCode).toBe(200);
    const body = res.json() as { id: string }[];
    expect(body.map((p) => p.id).sort()).toEqual(prs.map((p) => p.id).sort());

    // It really did try (and really did fail) — otherwise this asserts nothing.
    expect(enqueue).toHaveBeenCalledTimes(2);
    expect(await intentJobsFor(prs.map((p) => p.id))).toHaveLength(0);

    enqueue.mockRestore();
    await app.container.jobs.onIdle();
    await app.close();
  });

  it('NO DOUBLE-SPEND: a second list read while the first read\'s jobs are still in flight enqueues nothing', async () => {
    // The refetch-on-window-focus scenario. The gate holds every intent job inside
    // its model call, so when the SECOND read runs, the jobs from the first are
    // `queued`/`running` and NO `pr_intent` row exists yet — which is precisely the
    // check-then-act window a missing-row-only guard would re-bill on. The gate
    // delays the BOUNDARY (the LLM port); nothing about the route is mocked.
    const llm = new GatedLLMProvider({ structuredBySchema: { IntentExtraction: INTENT_FIXTURE } });
    const app = await listApp(llm);
    const { repo, prs } = await setupRepoWithPrs(3); // under the cap, so the cap isn't what's doing the work
    const prIds = prs.map((p) => p.id);

    const first = await app.inject({ method: 'GET', url: `/repos/${repo.id}/pulls` });
    expect(first.statusCode).toBe(200);
    const afterFirst = await intentJobsFor(prIds);
    expect(afterFirst).toHaveLength(3);

    // Nothing has landed: the jobs are in flight and no intent row exists.
    expect(afterFirst.every((j) => j.status === 'queued' || j.status === 'running')).toBe(true);
    expect(await pg.handle.db.select().from(t.prIntent).where(eq(t.prIntent.prId, prIds[0]!))).toHaveLength(0);

    const second = await app.inject({ method: 'GET', url: `/repos/${repo.id}/pulls` });
    expect(second.statusCode).toBe(200);

    // THE MONEY ASSERTION: the poll re-billed nothing. Revert the in-flight dedupe
    // in pulls/routes.ts and this is 6, then 9, then 12 — one more per refetch.
    expect(await intentJobsFor(prIds)).toHaveLength(3);

    llm.release();
    await app.container.jobs.onIdle();
    // The gate only delayed the calls; each PR was still classified exactly once.
    expect(modelCalls(llm)).toBe(3);
    await app.close();
  });
});
