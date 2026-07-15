/**
 * Blast Radius routes — GET /pulls/:id/blast-radius and GET /pulls/:id/history (L04).
 *
 * DB-backed (`.it.test.ts` — the suffix is what drives the unit/integration
 * split). It seeds a REAL repo-intel index (symbols · resolved references ·
 * file_edges · file_rank · file_facts · repo_index_state), because the whole
 * claim of this feature is "the answer is already in the index" — a test that
 * mocked the facade would prove nothing about that.
 *
 * The LOAD-BEARING assertions:
 *   1. NO LLM adapter is injected and no model call is made. Blast Radius is a
 *      read of data computed once at clone time. If this route ever grows a
 *      `container.llm()`, a missing provider key makes it throw — so a green run
 *      here IS the proof that the feature is free.
 *   2. An endpoint reachable ONLY through the 2-hop import graph shows up. That
 *      is the capability the caller list alone does not have.
 *   3. An unindexed repo returns 200 + `degraded`, never a 500 and never a blank.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';
import { seed } from '../src/db/seed.js';
import { MockGitHubClient } from '../src/adapters/mocks.js';
import * as t from '../src/db/schema.js';
import type { BlastRadius, PrHistory } from '@devdigest/shared';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

const config = () => loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv);

let seq = 0;

const RATELIMIT = 'src/middleware/ratelimit.ts'; // the changed file
const PUBLIC_INDEX = 'src/api/public/index.ts'; // calls rateLimit()  → 1 hop
const SERVER = 'src/server.ts'; // imports public/index → 2 hops

/**
 * Seeds a PR whose diff touches `ratelimit.ts`, plus the persistent index:
 *
 *   server.ts ──imports──▶ public/index.ts ──imports──▶ ratelimit.ts
 *                              │  calls rateLimit()
 *
 * `public/index.ts` owns `GET /api/public/items` and `server.ts` owns
 * `GET /api/public/health`. Only the FIRST is reachable from the caller list;
 * the second exists purely to prove the import-graph walk runs.
 */
async function setupIndexedPr(db: PgFixture['handle']['db'], workspaceId: string) {
  const name = `blast-${seq++}`;
  const [repo] = await db
    .insert(t.repos)
    .values({ workspaceId, owner: 'acme', name, fullName: `acme/${name}` })
    .returning();
  const repoId = repo!.id;

  const [pr] = await db
    .insert(t.pullRequests)
    .values({
      workspaceId,
      repoId,
      number: 482,
      title: 'Add rate limiting to public API endpoints',
      author: 'marisa.koch',
      branch: 'feat/rate-limit-public',
      base: 'main',
      headSha: 'deadbeef',
      filesCount: 1,
      status: 'open',
    })
    .returning();

  await db
    .insert(t.prFiles)
    .values({ prId: pr!.id, path: RATELIMIT, additions: 12, deletions: 3, patch: null });

  // --- the index the indexer would have built at clone time ------------------
  await db.insert(t.repoIndexState).values({
    repoId,
    lastIndexedSha: 'deadbeef',
    indexerVersion: 2,
    status: 'full',
    filesIndexed: 3,
    filesSkipped: 0,
  });

  await db.insert(t.symbols).values([
    // declared in the CHANGED file
    { repoId, path: RATELIMIT, name: 'rateLimit', kind: 'function', line: 10, exported: true },
    { repoId, path: RATELIMIT, name: 'bucketKey', kind: 'function', line: 40, exported: true },
    // the enclosing symbol of the caller, so the caller gets a real name
    { repoId, path: PUBLIC_INDEX, name: 'publicRouter', kind: 'function', line: 5, exported: true },
  ]);

  // `decl_file` is what makes a reference a RESOLVED caller.
  await db.insert(t.references).values({
    repoId,
    fromPath: PUBLIC_INDEX,
    toSymbol: 'rateLimit',
    line: 23,
    declFile: RATELIMIT,
  });

  await db.insert(t.fileEdges).values([
    { repoId, fromFile: PUBLIC_INDEX, toFile: RATELIMIT }, // hop 1
    { repoId, fromFile: SERVER, toFile: PUBLIC_INDEX }, // hop 2
  ]);

  await db.insert(t.fileRank).values(
    [RATELIMIT, PUBLIC_INDEX, SERVER].map((filePath, i) => ({
      repoId,
      filePath,
      pagerank: 1 - i * 0.1,
      hotness: 0,
      rank: 1 - i * 0.1,
      percentile: 90 - i,
    })),
  );

  await db.insert(t.fileFacts).values([
    { repoId, filePath: PUBLIC_INDEX, endpoints: ['GET /api/public/items'], crons: [] },
    { repoId, filePath: SERVER, endpoints: ['GET /api/public/health'], crons: [] },
  ]);

  return { repo: repo!, pr: pr! };
}

d('GET /pulls/:id/blast-radius (Testcontainers pg)', () => {
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

  // Only `github` is injected. NO `llm` override — a model call from this route
  // would blow up on a missing provider key, which is the guarantee we want.
  const app = () =>
    buildApp({ config: config(), db: pg.handle.db, overrides: { github: new MockGitHubClient() } });

  it('reads the index: changed symbols → callers → endpoints, with zero model calls', async () => {
    const server = await app();
    const { pr } = await setupIndexedPr(pg.handle.db, workspaceId);

    const res = await server.inject({ method: 'GET', url: `/pulls/${pr.id}/blast-radius` });
    expect(res.statusCode).toBe(200);
    const body = res.json() as BlastRadius;

    expect(body.degraded).toBe(false);
    expect(body.changed_symbols.map((s) => s.name).sort()).toEqual(['bucketKey', 'rateLimit']);

    const rateLimit = body.downstream.find((dd) => dd.symbol === 'rateLimit')!;
    expect(rateLimit.callers).toEqual([
      { name: 'publicRouter', file: PUBLIC_INDEX, line: 23 },
    ]);
  });

  it('surfaces an endpoint reachable ONLY through the 2-hop import graph', async () => {
    const server = await app();
    const { pr } = await setupIndexedPr(pg.handle.db, workspaceId);

    const res = await server.inject({ method: 'GET', url: `/pulls/${pr.id}/blast-radius` });
    const body = res.json() as BlastRadius;
    const rateLimit = body.downstream.find((dd) => dd.symbol === 'rateLimit')!;

    // From the direct caller — the one hop `callers` can see.
    expect(rateLimit.endpoints_affected).toContain('GET /api/public/items');
    // From `src/server.ts`, which NOTHING references directly. It is two import
    // hops from the changed file and is invisible without the reverse-edge walk.
    expect(rateLimit.endpoints_affected).toContain('GET /api/public/health');
  });

  it('degrades to 200 on an UNINDEXED repo — a badge, not a 500 and not a blank', async () => {
    const server = await app();
    const name = `unindexed-${seq++}`;
    const [repo] = await pg.handle.db
      .insert(t.repos)
      .values({ workspaceId, owner: 'acme', name, fullName: `acme/${name}` })
      .returning();
    const [pr] = await pg.handle.db
      .insert(t.pullRequests)
      .values({
        workspaceId,
        repoId: repo!.id,
        number: 7,
        title: 'x',
        author: 'a',
        branch: 'b',
        base: 'main',
        headSha: 'cafe',
        status: 'open',
      })
      .returning();
    await pg.handle.db
      .insert(t.prFiles)
      .values({ prId: pr!.id, path: 'src/whatever.ts', additions: 1, deletions: 0, patch: null });

    const res = await server.inject({ method: 'GET', url: `/pulls/${pr!.id}/blast-radius` });
    expect(res.statusCode).toBe(200);
    const body = res.json() as BlastRadius;

    expect(body.degraded).toBe(true);
    // The reason must SURVIVE serialization — `fastify-type-provider-zod` drops
    // any key the response schema does not declare, which is exactly how a
    // degraded badge silently becomes blank.
    expect(body.reason).toBeTruthy();
    expect(body.summary).toBeTruthy();
  });

  it('404s a PR from another workspace instead of leaking its blast radius', async () => {
    const server = await app();
    const [otherWs] = await pg.handle.db
      .insert(t.workspaces)
      .values({ name: `other-${seq++}` })
      .returning();
    const { pr } = await setupIndexedPr(pg.handle.db, otherWs!.id);

    const res = await server.inject({ method: 'GET', url: `/pulls/${pr.id}/blast-radius` });
    expect(res.statusCode).toBe(404);
  });

  it('422s an id that is not a uuid (schema-first: before the handler runs)', async () => {
    const server = await app();
    const res = await server.inject({ method: 'GET', url: '/pulls/not-a-uuid/blast-radius' });
    expect(res.statusCode).toBe(422);
  });
});

d('GET /pulls/:id/history (Testcontainers pg)', () => {
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

  const app = () =>
    buildApp({ config: config(), db: pg.handle.db, overrides: { github: new MockGitHubClient() } });

  it('degrades to an empty history when the repo has no clone — never a 500', async () => {
    const server = await app();
    const { pr } = await setupIndexedPr(pg.handle.db, workspaceId);

    // No clone on disk → `git.log` throws per file → every file degrades to
    // "no history". The route must still answer with a valid contract.
    const res = await server.inject({ method: 'GET', url: `/pulls/${pr.id}/history` });
    expect(res.statusCode).toBe(200);
    expect((res.json() as PrHistory).history).toEqual([]);
  });

  it('404s a PR from another workspace', async () => {
    const server = await app();
    const [otherWs] = await pg.handle.db
      .insert(t.workspaces)
      .values({ name: `other-h-${seq++}` })
      .returning();
    const { pr } = await setupIndexedPr(pg.handle.db, otherWs!.id);

    const res = await server.inject({ method: 'GET', url: `/pulls/${pr.id}/history` });
    expect(res.statusCode).toBe(404);
  });
});
