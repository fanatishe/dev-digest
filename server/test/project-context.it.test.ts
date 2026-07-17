import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { eq } from 'drizzle-orm';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';
import { seed } from '../src/db/seed.js';
import { MockGitClient, MockGitHubClient } from '../src/adapters/mocks.js';
import * as t from '../src/db/schema.js';

/**
 * project-context module (SPEC-01 WP-B) — DB-backed.
 *   - AC-2: an uncloned repo → `{ docs: [] }` with HTTP 200 + config token_budget.
 *   - AC-1/AC-3/AC-4: discovery walks the clone's roots, counts tokens, and tallies
 *     `used_by` across the workspace's attachments.
 *   - AC-7/AC-8/AC-9: attach/reorder persist an ordered path `string[]` on the
 *     agent/skill — PATHS ONLY, no document text.
 */
const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

if (!hasDocker) {
  // eslint-disable-next-line no-console
  console.warn('[project-context] Docker not available — skipping integration tests.');
}

const config = () => loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv);

let seq = 0;

d('project-context module', () => {
  let pg: PgFixture;
  let workspaceId: string;
  const tmpDirs: string[] = [];

  beforeAll(async () => {
    pg = await startPg();
    await seed(pg.handle.db);
    const [ws] = await pg.handle.db.select().from(t.workspaces);
    workspaceId = ws!.id;
  });
  afterAll(async () => {
    await Promise.all(tmpDirs.map((dir) => rm(dir, { recursive: true, force: true })));
    await pg?.stop();
  });

  function makeApp() {
    return buildApp({
      config: config(),
      db: pg.handle.db,
      overrides: { git: new MockGitClient(), github: new MockGitHubClient() },
    });
  }

  /** Insert a repo row (optionally with a clone path) directly. */
  async function insertRepo(clonePath: string | null): Promise<string> {
    const name = `ctx-${seq++}`;
    const [repo] = await pg.handle.db
      .insert(t.repos)
      .values({ workspaceId, owner: 'acme', name, fullName: `acme/${name}`, clonePath })
      .returning();
    return repo!.id;
  }

  /** Create a temp clone dir seeded with `specs/public-api.md`. */
  async function makeClone(body: string): Promise<string> {
    const dir = await mkdtemp(join(tmpdir(), 'pc-clone-'));
    tmpDirs.push(dir);
    await mkdir(join(dir, 'specs'), { recursive: true });
    await writeFile(join(dir, 'specs', 'public-api.md'), body);
    // A file outside the configured roots must NOT appear.
    await mkdir(join(dir, 'notes'), { recursive: true });
    await writeFile(join(dir, 'notes', 'other.md'), '# Other');
    return dir;
  }

  async function createAgent(app: Awaited<ReturnType<typeof makeApp>>): Promise<string> {
    const res = await app.inject({
      method: 'POST',
      url: '/agents',
      payload: { name: `A-${seq++}`, provider: 'openai', model: 'gpt-4o-mini', system_prompt: 'x' },
    });
    return res.json().id as string;
  }

  it('AC-2: an uncloned repo returns { docs: [] } with 200 and the config token budget', async () => {
    const app = await makeApp();
    const repoId = await insertRepo(null);
    const res = await app.inject({ method: 'GET', url: `/repos/${repoId}/context-docs` });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ docs: [], token_budget: config().projectContextTokenBudget });
    await app.close();
  });

  it('AC-1/AC-3/AC-4: discovery lists `.md` under roots with tokens and used_by tallies', async () => {
    const app = await makeApp();
    const docBody = '# Public API\nendpoints and shapes';
    const clone = await makeClone(docBody);
    const repoId = await insertRepo(clone);

    // Attach specs/public-api.md to TWO agents → used_by_agents should be 2 (AC-4).
    const a1 = await createAgent(app);
    const a2 = await createAgent(app);
    for (const id of [a1, a2]) {
      const r = await app.inject({
        method: 'PUT',
        url: `/agents/${id}/context-docs`,
        payload: { context_docs: ['specs/public-api.md'] },
      });
      expect(r.statusCode).toBe(200);
    }

    const res = await app.inject({ method: 'GET', url: `/repos/${repoId}/context-docs` });
    expect(res.statusCode).toBe(200);
    const body = res.json() as {
      docs: { path: string; root: string; tokens: number; used_by_agents: number }[];
    };
    const paths = body.docs.map((doc) => doc.path);
    expect(paths).toEqual(['specs/public-api.md']); // notes/other.md excluded (AC-1)

    const doc = body.docs[0]!;
    expect(doc.root).toBe('specs');
    expect(doc.tokens).toBe(app.container.tokenizer.count(docBody)); // AC-3: exact tokenizer count
    expect(doc.used_by_agents).toBe(2); // AC-4
    await app.close();
  });

  it('AC-6 content: returns { path, body } for a safe existing `.md` under the clone', async () => {
    const app = await makeApp();
    const docBody = '# Public API\nfull document body for preview';
    const clone = await makeClone(docBody);
    const repoId = await insertRepo(clone);

    const res = await app.inject({
      method: 'GET',
      url: `/repos/${repoId}/context-docs/content?path=${encodeURIComponent('specs/public-api.md')}`,
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ path: 'specs/public-api.md', body: docBody });
    await app.close();
  });

  it('AC-6 content: a `../../etc/passwd` traversal path 404s and reads nothing outside the clone', async () => {
    const app = await makeApp();
    const clone = await makeClone('# safe');
    const repoId = await insertRepo(clone);

    const res = await app.inject({
      method: 'GET',
      url: `/repos/${repoId}/context-docs/content?path=${encodeURIComponent('../../etc/passwd')}`,
    });
    // Rejected by isSafeRepoPath BEFORE any read → clean 404, never a 500, no file body leaked.
    expect(res.statusCode).toBe(404);
    expect(res.json()).not.toHaveProperty('body');
    await app.close();
  });

  it('AC-6 content: a non-`.md` path 404s (extension boundary)', async () => {
    const app = await makeApp();
    const clone = await makeClone('# safe');
    const repoId = await insertRepo(clone);

    const res = await app.inject({
      method: 'GET',
      url: `/repos/${repoId}/context-docs/content?path=${encodeURIComponent('specs/config.yaml')}`,
    });
    expect(res.statusCode).toBe(404);
    await app.close();
  });

  it('AC-6 content: an absent `.md` path 404s', async () => {
    const app = await makeApp();
    const clone = await makeClone('# safe');
    const repoId = await insertRepo(clone);

    const res = await app.inject({
      method: 'GET',
      url: `/repos/${repoId}/context-docs/content?path=${encodeURIComponent('specs/missing.md')}`,
    });
    expect(res.statusCode).toBe(404);
    await app.close();
  });

  it("AC-7: attaching docs persists exactly those paths in order, and no document body", async () => {
    const app = await makeApp();
    const agentId = await createAgent(app);
    const paths = ['specs/public-api.md', 'docs/design/overview.md'];

    const put = await app.inject({
      method: 'PUT',
      url: `/agents/${agentId}/context-docs`,
      payload: { context_docs: paths },
    });
    expect(put.statusCode).toBe(200);
    expect(put.json().context_docs).toEqual(paths);

    // The GET DTO surfaces the same ordered list.
    const got = await app.inject({ method: 'GET', url: `/agents/${agentId}` });
    expect(got.json().context_docs).toEqual(paths);

    // The column holds exactly the paths — a string[] of paths, never a body.
    const [row] = await pg.handle.db
      .select({ contextDocs: t.agents.contextDocs })
      .from(t.agents)
      .where(eq(t.agents.id, agentId));
    expect(row!.contextDocs).toEqual(paths);
    await app.close();
  });

  it('AC-8: reordering re-PUTs the list and persists the new order', async () => {
    const app = await makeApp();
    const agentId = await createAgent(app);
    const original = ['specs/a.md', 'specs/b.md', 'specs/c.md'];
    await app.inject({
      method: 'PUT',
      url: `/agents/${agentId}/context-docs`,
      payload: { context_docs: original },
    });

    const reordered = ['specs/c.md', 'specs/a.md', 'specs/b.md'];
    const put = await app.inject({
      method: 'PUT',
      url: `/agents/${agentId}/context-docs`,
      payload: { context_docs: reordered },
    });
    expect(put.json().context_docs).toEqual(reordered);

    const got = await app.inject({ method: 'GET', url: `/agents/${agentId}` });
    expect(got.json().context_docs).toEqual(reordered);
    await app.close();
  });

  it('AC-9: skills carry context_docs on the same contract', async () => {
    const app = await makeApp();
    const created = await app.inject({
      method: 'POST',
      url: '/skills',
      payload: {
        name: `S-${seq++}`,
        description: 'ctx skill',
        type: 'convention',
        body: '# body',
      },
    });
    const skillId = created.json().id as string;
    const paths = ['insights/patterns.md'];

    const put = await app.inject({
      method: 'PUT',
      url: `/skills/${skillId}/context-docs`,
      payload: { context_docs: paths },
    });
    expect(put.statusCode).toBe(200);
    expect(put.json().context_docs).toEqual(paths);
    // A metadata-only attach must NOT bump the skill body version.
    expect(put.json().version).toBe(1);

    const got = await app.inject({ method: 'GET', url: `/skills/${skillId}` });
    expect(got.json().context_docs).toEqual(paths);
    await app.close();
  });

  it('rejects a traversal path at the write boundary (422)', async () => {
    const app = await makeApp();
    const agentId = await createAgent(app);
    const res = await app.inject({
      method: 'PUT',
      url: `/agents/${agentId}/context-docs`,
      payload: { context_docs: ['../../etc/passwd'] },
    });
    expect(res.statusCode).toBe(422);
    await app.close();
  });

  it('404s attaching to an agent that is not in the workspace', async () => {
    const app = await makeApp();
    const res = await app.inject({
      method: 'PUT',
      url: `/agents/${crypto.randomUUID()}/context-docs`,
      payload: { context_docs: ['specs/x.md'] },
    });
    expect(res.statusCode).toBe(404);
    await app.close();
  });
});
