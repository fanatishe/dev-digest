import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';
import { seed } from '../src/db/seed.js';
import { MockGitClient, MockGitHubClient } from '../src/adapters/mocks.js';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

if (!hasDocker) {
  // eslint-disable-next-line no-console
  console.warn('[skills] Docker not available — skipping integration tests.');
}

/**
 * Skills module — CRUD, body-versioning, and the extract-only import preview.
 */
d('skills module', () => {
  let pg: PgFixture;

  beforeAll(async () => {
    pg = await startPg();
    await seed(pg.handle.db);
  });
  afterAll(async () => {
    await pg?.stop();
  });

  function makeApp() {
    const config = loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv);
    return buildApp({
      config,
      db: pg.handle.db,
      overrides: { git: new MockGitClient(), github: new MockGitHubClient() },
    });
  }

  const createBody = {
    name: 'no-then-chains',
    description: 'Ban .then() chains; require async/await.',
    type: 'convention' as const,
    body: '# Rule\nUse async/await, not .then().',
  };

  it('creates a skill (v1), lists it, and defaults source=manual/enabled=true', async () => {
    const app = await makeApp();
    const created = await app.inject({ method: 'POST', url: '/skills', payload: createBody });
    expect(created.statusCode).toBe(201);
    const skill = created.json();
    expect(skill).toMatchObject({
      name: 'no-then-chains',
      type: 'convention',
      source: 'manual',
      enabled: true,
      version: 1,
    });

    const list = await app.inject({ method: 'GET', url: '/skills' });
    expect(list.statusCode).toBe(200);
    expect(list.json().some((s: { id: string }) => s.id === skill.id)).toBe(true);
    await app.close();
  });

  it('a body edit bumps the version and snapshots history; metadata edits do not', async () => {
    const app = await makeApp();
    const id = (await app.inject({ method: 'POST', url: '/skills', payload: createBody })).json()
      .id as string;

    // Metadata-only change → same version.
    const renamed = await app.inject({
      method: 'PUT',
      url: `/skills/${id}`,
      payload: { name: 'renamed', enabled: false },
    });
    expect(renamed.json().version).toBe(1);

    // Body change → v2.
    const edited = await app.inject({
      method: 'PUT',
      url: `/skills/${id}`,
      payload: { body: '# Rule v2\nStricter.' },
    });
    expect(edited.json().version).toBe(2);

    const versions = (await app.inject({ method: 'GET', url: `/skills/${id}/versions` })).json();
    expect(versions.map((v: { version: number }) => v.version)).toEqual([2, 1]);
    await app.close();
  });

  it('deletes a skill and 404s afterward', async () => {
    const app = await makeApp();
    const id = (await app.inject({ method: 'POST', url: '/skills', payload: createBody })).json()
      .id as string;
    expect((await app.inject({ method: 'DELETE', url: `/skills/${id}` })).statusCode).toBe(200);
    expect((await app.inject({ method: 'GET', url: `/skills/${id}` })).statusCode).toBe(404);
    await app.close();
  });

  it('POST /skills/import returns a markdown preview WITHOUT persisting', async () => {
    const app = await makeApp();
    const before = (await app.inject({ method: 'GET', url: '/skills' })).json().length;

    const res = await app.inject({
      method: 'POST',
      url: '/skills/import',
      payload: { kind: 'markdown', content: '# imported-rubric\nScore PRs.', filename: 'x.md' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ name: 'imported-rubric', source: 'extracted' });

    const after = (await app.inject({ method: 'GET', url: '/skills' })).json().length;
    expect(after).toBe(before); // nothing saved until the client confirms
    await app.close();
  });

  it('rejects an empty markdown import with 422', async () => {
    const app = await makeApp();
    const res = await app.inject({
      method: 'POST',
      url: '/skills/import',
      payload: { kind: 'markdown', content: '   ' },
    });
    // min(1) passes on whitespace, but the extractor rejects an empty body → 422.
    expect(res.statusCode).toBe(422);
    await app.close();
  });

  it('captures a version message and restores an old body as a new version', async () => {
    const app = await makeApp();
    const id = (
      await app.inject({
        method: 'POST',
        url: '/skills',
        payload: { ...createBody, body: '# v1 body', message: 'Initial' },
      })
    ).json().id as string;

    // Body edit → v2 with its own message.
    await app.inject({
      method: 'PUT',
      url: `/skills/${id}`,
      payload: { body: '# v2 body', message: 'Tightened rule' },
    });

    // Restore v1 → new v3 whose body equals v1's.
    const restored = await app.inject({
      method: 'POST',
      url: `/skills/${id}/restore`,
      payload: { version: 1 },
    });
    expect(restored.statusCode).toBe(200);
    expect(restored.json()).toMatchObject({ version: 3, body: '# v1 body' });

    const versions = (await app.inject({ method: 'GET', url: `/skills/${id}/versions` })).json();
    expect(versions.map((v: { version: number }) => v.version)).toEqual([3, 2, 1]);
    expect(versions.find((v: { version: number }) => v.version === 3).message).toBe('Restored from v1');
    expect(versions.find((v: { version: number }) => v.version === 1).message).toBe('Initial');
    await app.close();
  });

  it('reports used_by count (list) and agents-using (stats) after linking', async () => {
    const app = await makeApp();
    const skillId = (await app.inject({ method: 'POST', url: '/skills', payload: createBody })).json()
      .id as string;
    const agentId = (
      await app.inject({
        method: 'POST',
        url: '/agents',
        payload: { name: 'Linker', provider: 'openai', model: 'gpt-4o-mini', system_prompt: 'x' },
      })
    ).json().id as string;

    // Before linking: used_by 0, no agents.
    const before = (await app.inject({ method: 'GET', url: `/skills/${skillId}/stats` })).json();
    expect(before).toEqual({ used_by: 0, agents: [] });

    await app.inject({ method: 'POST', url: `/agents/${agentId}/skills`, payload: { skill_ids: [skillId] } });

    const stats = (await app.inject({ method: 'GET', url: `/skills/${skillId}/stats` })).json();
    expect(stats).toEqual({ used_by: 1, agents: [{ id: agentId, name: 'Linker' }] });

    const listed = (await app.inject({ method: 'GET', url: '/skills' })).json();
    expect(listed.find((s: { id: string }) => s.id === skillId).used_by).toBe(1);
    await app.close();
  });
});
