import { describe, it, expect, afterAll } from 'vitest';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';
import { MockGitHubClient, MockLLMProvider } from '../src/adapters/mocks.js';

/**
 * No-DB route smoke tests via app.inject(). `/health` and the validation/error
 * envelope don't touch the database (postgres-js connects lazily), so these run
 * without Docker. DB-backed routes are covered in integration.test.ts.
 */
const config = loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv);

describe('routes (no DB)', () => {
  it('GET /health → ok', async () => {
    const app = await buildApp({ config });
    const res = await app.inject({ method: 'GET', url: '/health' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ status: 'ok' });
    await app.close();
  });

  it('POST /settings/test-connection (github) returns structured ConnTestResult', async () => {
    const app = await buildApp({
      config,
      overrides: { github: new MockGitHubClient({ login: 'octocat' }) },
    });
    const res = await app.inject({
      method: 'POST',
      url: '/settings/test-connection',
      payload: { provider: 'github' },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.provider).toBe('github');
    expect(body.ok).toBe(true);
    expect(body.message).toContain('octocat');
    await app.close();
  });

  it('POST /settings/test-connection (openai) uses injected LLM listModels', async () => {
    const app = await buildApp({
      config,
      overrides: {
        llm: { openai: new MockLLMProvider('openai', { models: [{ id: 'gpt-4.1', provider: 'openai' }] }) },
      },
    });
    const res = await app.inject({
      method: 'POST',
      url: '/settings/test-connection',
      payload: { provider: 'openai' },
    });
    expect(res.json().ok).toBe(true);
    await app.close();
  });

  it('returns 422 structured error on invalid body', async () => {
    const app = await buildApp({ config });
    const res = await app.inject({
      method: 'POST',
      url: '/settings/test-connection',
      payload: { provider: 'not-a-provider' },
    });
    expect(res.statusCode).toBe(422);
    expect(res.json().error.code).toBe('validation_error');
    await app.close();
  });

  /**
   * The Blast Radius routes are REGISTERED and schema-wired (L04).
   *
   * This runs without Docker, and that is the point: a non-uuid `:id` is rejected by
   * the params schema BEFORE the handler runs, so no database is touched. A 422 proves
   * the route exists and its contract is attached; a 404 would mean the route was never
   * registered at all — the exact failure the MCP tool was stubbed around for months.
   * (Behaviour on a REAL id is covered in `blast-radius.it.test.ts`, which needs Postgres.)
   */
  it('GET /pulls/:id/blast-radius is registered and schema-first (422, not 404)', async () => {
    const app = await buildApp({ config });
    const res = await app.inject({ method: 'GET', url: '/pulls/not-a-uuid/blast-radius' });
    expect(res.statusCode).toBe(422);
    expect(res.json().error.code).toBe('validation_error');
    await app.close();
  });

  it('GET /pulls/:id/history is registered and schema-first (422, not 404)', async () => {
    const app = await buildApp({ config });
    const res = await app.inject({ method: 'GET', url: '/pulls/not-a-uuid/history' });
    expect(res.statusCode).toBe(422);
    expect(res.json().error.code).toBe('validation_error');
    await app.close();
  });

  /**
   * The Eval routes (L06) are REGISTERED and schema-first. A non-uuid `:id` (and
   * a bad `owner_kind`/compare query) is rejected by the Zod schema BEFORE the
   * handler runs — no DB touched — so a 422 (not 404) proves registration + the
   * attached contract without Docker. DB behaviour is in `eval/service.it.test.ts`.
   */
  it('POST /eval/cases/:id/run is registered and schema-first (422, not 404)', async () => {
    const app = await buildApp({ config });
    const res = await app.inject({ method: 'POST', url: '/eval/cases/not-a-uuid/run', payload: {} });
    expect(res.statusCode).toBe(422);
    expect(res.json().error.code).toBe('validation_error');
    await app.close();
  });

  it('GET /eval/cases/:id/runs is registered and schema-first (422, not 404)', async () => {
    const app = await buildApp({ config });
    const res = await app.inject({ method: 'GET', url: '/eval/cases/not-a-uuid/runs' });
    expect(res.statusCode).toBe(422);
    await app.close();
  });

  it('GET /eval/cases rejects a bad owner_kind at the edge (422)', async () => {
    const app = await buildApp({ config });
    const res = await app.inject({
      method: 'GET',
      url: '/eval/cases?owner_kind=bogus&owner_id=00000000-0000-0000-0000-000000000000',
    });
    expect(res.statusCode).toBe(422);
    await app.close();
  });

  it('POST /agents/:id/eval/run-all and /agents/:id/eval/promote are registered (422, not 404)', async () => {
    const app = await buildApp({ config });
    const runAll = await app.inject({ method: 'POST', url: '/agents/not-a-uuid/eval/run-all', payload: {} });
    expect(runAll.statusCode).toBe(422);
    const promote = await app.inject({
      method: 'POST',
      url: '/agents/not-a-uuid/eval/promote',
      payload: { version: 1 },
    });
    expect(promote.statusCode).toBe(422);
    await app.close();
  });

  it('GET /eval/compare requires uuid base/head (422, not 404)', async () => {
    const app = await buildApp({ config });
    const res = await app.inject({ method: 'GET', url: '/eval/compare?base=x&head=y' });
    expect(res.statusCode).toBe(422);
    await app.close();
  });
});
