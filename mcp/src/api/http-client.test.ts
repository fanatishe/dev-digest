import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { HttpApiClient } from './http-client.js';
import { loadConfig } from '../config.js';
import { ApiError, ApiUnreachableError } from '../errors.js';

const BASE = 'http://api.test';
const REPO_ID = '11111111-1111-4111-8111-111111111111';

const config = loadConfig({ DEVDIGEST_API_URL: BASE } as NodeJS.ProcessEnv);

const json = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });

/** The transport is stubbed at the global — this is the ONE place that is allowed. */
const transport = vi.fn();

beforeEach(() => {
  transport.mockReset();
  vi.stubGlobal('fetch', transport);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('error decoding', () => {
  it('decodes an ApiErrorBody envelope into a typed ApiError', async () => {
    transport.mockResolvedValue(
      json({ error: { code: 'not_found', message: 'Repo not found', details: { id: 'x' } } }, 404),
    );
    const api = new HttpApiClient(config);

    const err = await api.listRepos().catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApiError);
    const apiErr = err as ApiError;
    expect(apiErr.status).toBe(404);
    expect(apiErr.code).toBe('not_found');
    expect(apiErr.message).toBe('Repo not found');
    expect(apiErr.details).toEqual({ id: 'x' });
  });

  it('still produces an ApiError when the body is not an envelope', async () => {
    transport.mockResolvedValue(new Response('<html>502</html>', { status: 502 }));
    const api = new HttpApiClient(config);

    const err = (await api.listRepos().catch((e: unknown) => e)) as ApiError;
    expect(err).toBeInstanceOf(ApiError);
    expect(err.status).toBe(502);
    expect(err.code).toBe('http_error');
  });

  it('maps a transport failure (API down) to ApiUnreachableError', async () => {
    transport.mockRejectedValue(new TypeError('fetch failed'));
    const api = new HttpApiClient(config);

    const err = (await api.health().catch((e: unknown) => e)) as ApiUnreachableError;
    expect(err).toBeInstanceOf(ApiUnreachableError);
    expect(err.baseUrl).toBe(BASE);
  });
});

describe('the 60s TTL cache (§7)', () => {
  it('issues exactly ONE request for two listPulls calls inside the window', async () => {
    transport.mockResolvedValue(json([{ number: 482 }]));
    const api = new HttpApiClient(config);

    const [first, second] = await Promise.all([api.listPulls(REPO_ID), api.listPulls(REPO_ID)]);
    const third = await api.listPulls(REPO_ID);

    expect(transport).toHaveBeenCalledTimes(1);
    expect(first).toEqual(second);
    expect(third).toEqual(first);
    expect(transport.mock.calls[0]?.[0]).toBe(`${BASE}/repos/${REPO_ID}/pulls`);
  });

  it('caches listRepos too — the other half of identifier resolution', async () => {
    transport.mockResolvedValue(json([]));
    const api = new HttpApiClient(config);

    await api.listRepos();
    await api.listRepos();

    expect(transport).toHaveBeenCalledTimes(1);
  });

  it('re-requests once the TTL has expired', async () => {
    transport.mockResolvedValue(json([]));
    let clock = 1_000;
    const api = new HttpApiClient(config, () => clock);

    await api.listPulls(REPO_ID);
    clock += config.cacheTtlMs + 1;
    await api.listPulls(REPO_ID);

    expect(transport).toHaveBeenCalledTimes(2);
  });

  it('does not cache a failure — the next attempt really retries', async () => {
    transport.mockResolvedValueOnce(json({ error: { code: 'boom', message: 'boom' } }, 500));
    transport.mockResolvedValueOnce(json([]));
    const api = new HttpApiClient(config);

    await expect(api.listRepos()).rejects.toBeInstanceOf(ApiError);
    await expect(api.listRepos()).resolves.toEqual([]);
    expect(transport).toHaveBeenCalledTimes(2);
  });

  it('NEVER caches the billable write, nor the poll target', async () => {
    transport.mockResolvedValue(json({ pr_id: 'p', runs: [], reviews: [] }));
    const api = new HttpApiClient(config);

    await api.startReview('pr-1', 'agent-1');
    await api.startReview('pr-1', 'agent-1');
    await api.listRuns('pr-1');
    await api.listRuns('pr-1');

    expect(transport).toHaveBeenCalledTimes(4);
    const [url, init] = transport.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(`${BASE}/pulls/pr-1/review`);
    expect(init.method).toBe('POST');
    expect(init.body).toBe(JSON.stringify({ agentId: 'agent-1' }));
  });
});
