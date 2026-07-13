/**
 * Smart Diff route — GET /pulls/:id/smart-diff (L03).
 *
 * DB-backed (`.it.test.ts` — the suffix is what drives the unit/integration
 * split), because the route composes pr_files + the latest review's findings
 * through the `container.reviewRepo` facade. Gated on Docker, like every other
 * integration test here.
 *
 * The LOAD-BEARING assertion of this suite: NO LLM adapter is injected and NO
 * model call is made. Smart Diff is a deterministic recomposition of data we
 * already have — if this route ever grows a `container.llm()`, the whole point
 * of the feature is gone. (A missing provider key would make such a call throw,
 * so a green run here IS the proof.)
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';
import { seed } from '../src/db/seed.js';
import { MockGitHubClient } from '../src/adapters/mocks.js';
import * as t from '../src/db/schema.js';
import type { SmartDiff } from '@devdigest/shared';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

const config = () => loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv);

let seq = 0;

async function setupPr(
  db: PgFixture['handle']['db'],
  workspaceId: string,
  opts: { files: { path: string; additions: number; deletions: number; patch?: string }[] },
) {
  const name = `smart-diff-${seq++}`;
  const [repo] = await db
    .insert(t.repos)
    .values({ workspaceId, owner: 'acme', name, fullName: `acme/${name}` })
    .returning();
  const [pr] = await db
    .insert(t.pullRequests)
    .values({
      workspaceId,
      repoId: repo!.id,
      number: 11,
      title: 'Add rate limiting',
      author: 'marisa.koch',
      branch: 'feat/rl',
      base: 'main',
      headSha: 'deadbeef',
      additions: 12,
      deletions: 3,
      filesCount: opts.files.length,
      status: 'open',
    })
    .returning();
  await db.insert(t.prFiles).values(
    opts.files.map((f) => ({
      prId: pr!.id,
      path: f.path,
      additions: f.additions,
      deletions: f.deletions,
      patch: f.patch ?? null,
    })),
  );
  return { repo: repo!, pr: pr! };
}

/**
 * `kind` is a PARAMETER, not a hard-coded 'review'.
 *
 * The route filters `reviews` to `kind === 'review'` before it picks the latest
 * one — a SUMMARY is not a review and its findings must not badge a line. A helper
 * that can only ever seed `kind: 'review'` cannot exercise that filter: delete the
 * filter from `pulls/routes.ts` and every assertion still passes. The `kind`
 * enum is `summary | review` (db/schema/reviews.ts).
 */
async function seedReview(
  db: PgFixture['handle']['db'],
  workspaceId: string,
  prId: string,
  findings: {
    file: string;
    startLine: number;
    severity?: string;
    dismissed?: boolean;
  }[],
  kind: 'review' | 'summary' = 'review',
) {
  const [review] = await db
    .insert(t.reviews)
    .values({ workspaceId, prId, agentId: null, runId: null, kind, score: 80 })
    .returning();
  await db.insert(t.findings).values(
    findings.map((f) => ({
      reviewId: review!.id,
      file: f.file,
      startLine: f.startLine,
      endLine: f.startLine,
      severity: f.severity ?? 'CRITICAL',
      category: 'security',
      title: 'Unbounded input',
      rationale: 'because',
      confidence: 0.9,
      dismissedAt: f.dismissed ? new Date() : null,
    })),
  );
  return review!;
}

const FILES = [
  { path: 'pnpm-lock.yaml', additions: 900, deletions: 300 }, // boilerplate
  { path: 'src/index.ts', additions: 2, deletions: 1 }, // wiring
  { path: 'src/modules/reviews/service.ts', additions: 10, deletions: 2 }, // core, big
  {
    path: 'src/modules/pulls/routes.ts', // core, smaller — but FLAGGED
    additions: 3,
    deletions: 1,
    patch: '@@ -1,2 +1,4 @@\n+export function rateLimit() {}',
  },
];

d('GET /pulls/:id/smart-diff (Testcontainers pg)', () => {
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

  // NOTE: only `github` is injected (the PR-list/detail routes reach for it).
  // NO `llm` override — a model call from this route would blow up on a missing
  // provider key, which is exactly the guarantee we want.
  const app = () =>
    buildApp({ config: config(), db: pg.handle.db, overrides: { github: new MockGitHubClient() } });

  it('groups core → wiring → boilerplate, flags findings, and excludes dismissed ones', async () => {
    const server = await app();
    const { pr } = await setupPr(pg.handle.db, workspaceId, { files: FILES });
    await seedReview(pg.handle.db, workspaceId, pr.id, [
      { file: 'src/modules/pulls/routes.ts', startLine: 42 },
      { file: 'src/modules/pulls/routes.ts', startLine: 7 },
      // dismissed → must NOT badge a line (the Findings tab hides it, so the
      // badge would reveal nothing).
      { file: 'src/modules/reviews/service.ts', startLine: 99, dismissed: true },
    ]);

    const res = await server.inject({ method: 'GET', url: `/pulls/${pr.id}/smart-diff` });
    expect(res.statusCode).toBe(200);
    const body = res.json() as SmartDiff;

    expect(body.groups.map((g) => g.role)).toEqual(['core', 'wiring', 'boilerplate']);

    const core = body.groups.find((g) => g.role === 'core')!;
    // The flagged file leads its group even though it is the smaller change.
    expect(core.files.map((f) => f.path)).toEqual([
      'src/modules/pulls/routes.ts',
      'src/modules/reviews/service.ts',
    ]);
    expect(core.files[0]!.finding_lines).toEqual([7, 42]);
    // the dismissed finding left no trace
    expect(core.files[1]!.finding_lines).toEqual([]);

    // pseudocode_summary is derived from the patch — deterministically, no LLM.
    expect(core.files[0]!.pseudocode_summary).toBe('Changed: rateLimit()');

    expect(body.split_suggestion).toMatchObject({ too_big: true, total_lines: 1_219 });
  });

  it('ignores a summary review and reads findings from the LATEST review only', async () => {
    const server = await app();
    const { pr } = await setupPr(pg.handle.db, workspaceId, { files: FILES });
    // An older real review…
    await seedReview(pg.handle.db, workspaceId, pr.id, [
      { file: 'src/modules/reviews/service.ts', startLine: 5 },
    ]);
    // …then a newer real review, whose findings are the ones that must win.
    await new Promise((r) => setTimeout(r, 10));
    await seedReview(pg.handle.db, workspaceId, pr.id, [
      { file: 'src/modules/pulls/routes.ts', startLine: 21 },
    ]);
    // …and finally the NEWEST row of all: a SUMMARY, carrying a finding of its own.
    // It is the newest by `created_at`, so a handler that took `reviews[0]` — i.e.
    // one that dropped the `kind === 'review'` filter — would badge line 777 and
    // badge NOTHING from the real review. Both assertions below break in that case,
    // which is what makes this test an actual guard on the filter.
    await new Promise((r) => setTimeout(r, 10));
    await seedReview(
      pg.handle.db,
      workspaceId,
      pr.id,
      [{ file: 'src/modules/reviews/service.ts', startLine: 777 }],
      'summary',
    );

    const res = await server.inject({ method: 'GET', url: `/pulls/${pr.id}/smart-diff` });
    const body = res.json() as SmartDiff;
    const core = body.groups.find((g) => g.role === 'core')!;
    const byPath = new Map(core.files.map((f) => [f.path, f.finding_lines]));
    // The latest REVIEW wins…
    expect(byPath.get('src/modules/pulls/routes.ts')).toEqual([21]);
    // …and neither the older review's line 5 nor the summary's line 777 badges it.
    expect(byPath.get('src/modules/reviews/service.ts')).toEqual([]);
    expect(body.groups.flatMap((g) => g.files).flatMap((f) => f.finding_lines)).not.toContain(777);
  });

  it('degrades on a PR with no review: 200, groups intact, every finding_lines empty', async () => {
    const server = await app();
    const { pr } = await setupPr(pg.handle.db, workspaceId, { files: FILES });

    const res = await server.inject({ method: 'GET', url: `/pulls/${pr.id}/smart-diff` });
    expect(res.statusCode).toBe(200);
    const body = res.json() as SmartDiff;

    expect(body.groups.map((g) => g.role)).toEqual(['core', 'wiring', 'boilerplate']);
    const all = body.groups.flatMap((g) => g.files);
    expect(all).toHaveLength(4);
    expect(all.every((f) => f.finding_lines.length === 0)).toBe(true);
    // split_suggestion is non-nullable in the contract — always emitted.
    expect(body.split_suggestion.proposed_splits).toHaveLength(3);
  });

  it('404s a PR from another workspace instead of leaking its diff', async () => {
    const server = await app();
    const [otherWs] = await pg.handle.db
      .insert(t.workspaces)
      .values({ name: `other-${seq++}` })
      .returning();
    const { pr } = await setupPr(pg.handle.db, otherWs!.id, { files: FILES });

    // The request runs as the seeded (default) workspace — a PR belonging to
    // another one must 404, not 200 with someone else's files.
    const res = await server.inject({ method: 'GET', url: `/pulls/${pr.id}/smart-diff` });
    expect(res.statusCode).toBe(404);
  });

  it('422s an id that is not a uuid (schema-first: before the handler runs)', async () => {
    const server = await app();
    const res = await server.inject({ method: 'GET', url: '/pulls/not-a-uuid/smart-diff' });
    expect(res.statusCode).toBe(422);
  });
});
