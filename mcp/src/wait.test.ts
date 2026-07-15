import { describe, expect, it, vi } from 'vitest';
import type { ApiPort } from './ports.js';
import type { RunSummary } from './types.js';
import { waitForRun } from './wait.js';

const PR_ID = '22222222-2222-4222-8222-222222222222';
const RUN_ID = '44444444-4444-4444-8444-444444444444';

const run = (over: Partial<RunSummary> = {}): RunSummary => ({
  run_id: RUN_ID,
  agent_id: '33333333-3333-4333-8333-333333333333',
  agent_name: 'Security',
  provider: 'openai',
  model: 'gpt-4.1',
  status: 'running',
  error: null,
  duration_ms: null,
  tokens_in: null,
  tokens_out: null,
  cost_usd: null,
  findings_count: null,
  grounding: null,
  ran_at: null,
  score: null,
  blockers: null,
  ...over,
});

/** A plain mock object — no `fetch` stubbing, no HTTP. That is what the port buys. */
function mockApi(listRuns: ApiPort['listRuns']): ApiPort {
  return {
    health: vi.fn(),
    listRepos: vi.fn(),
    listPulls: vi.fn(),
    listAgents: vi.fn(),
    startReview: vi.fn(),
    listRuns: vi.fn(listRuns),
    listReviews: vi.fn(),
    listConventions: vi.fn(),
  } as unknown as ApiPort;
}

/** The injected clock. Records what we asked to wait for; never actually waits. */
function fakeSleep(): { sleep: (ms: number) => Promise<void>; slept: number[] } {
  const slept: number[] = [];
  return {
    slept,
    sleep: async (ms: number) => {
      slept.push(ms);
    },
  };
}

const OPTIONS = { pollMs: 1_000, timeoutMs: 3_000, firstDelayMs: 1_500 };

describe('waitForRun (§6 — poll, not SSE)', () => {
  it('polls until the run leaves `running`, and returns the terminal run', async () => {
    const statuses = ['running', 'running', 'done'];
    const api = mockApi(async () => [run({ status: statuses.shift() ?? 'done', cost_usd: 0.42 })]);
    const { sleep, slept } = fakeSleep();

    const result = await waitForRun(api, PR_ID, RUN_ID, {
      ...OPTIONS,
      timeoutMs: 60_000,
      sleep,
    });

    expect(result.status).toBe('done');
    expect(result.run?.cost_usd).toBe(0.42);
    expect(api.listRuns).toHaveBeenCalledTimes(3);
    // The first wait is longer — a run is never done in a poll interval.
    expect(slept).toEqual([1_500, 1_000, 1_000]);
  });

  it('returns immediately on `failed`, carrying the run error', async () => {
    const api = mockApi(async () => [run({ status: 'failed', error: 'provider 401' })]);
    const { sleep } = fakeSleep();

    const result = await waitForRun(api, PR_ID, RUN_ID, { ...OPTIONS, sleep });

    expect(result.status).toBe('failed');
    expect(result.run?.error).toBe('provider 401');
    expect(api.listRuns).toHaveBeenCalledTimes(1);
  });

  it('maps `cancelled` to its own outcome', async () => {
    const api = mockApi(async () => [run({ status: 'cancelled' })]);
    const { sleep } = fakeSleep();

    const result = await waitForRun(api, PR_ID, RUN_ID, { ...OPTIONS, sleep });

    expect(result.status).toBe('cancelled');
  });

  it('ignores other runs on the same PR and waits for the target run_id', async () => {
    const other = run({ run_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', status: 'done' });
    const statuses = ['running', 'done'];
    const api = mockApi(async () => [other, run({ status: statuses.shift() ?? 'done' })]);
    const { sleep } = fakeSleep();

    const result = await waitForRun(api, PR_ID, RUN_ID, { ...OPTIONS, sleep });

    expect(result.status).toBe('done');
    expect(result.run?.run_id).toBe(RUN_ID);
    expect(api.listRuns).toHaveBeenCalledTimes(2);
  });

  it('gives up after the budget WITHOUT cancelling the run — the money rule', async () => {
    // The run never finishes. 1500 + 1000 + 1000 = 3500ms ≥ the 3000ms budget → 3 polls.
    const api = mockApi(async () => [run({ status: 'running' })]);
    const { sleep, slept } = fakeSleep();

    const result = await waitForRun(api, PR_ID, RUN_ID, { ...OPTIONS, sleep });

    expect(result.status).toBe('timeout');
    expect(result.run?.status).toBe('running');
    expect(api.listRuns).toHaveBeenCalledTimes(3);
    expect(slept).toEqual([1_500, 1_000, 1_000]);

    // NOTHING but the poll was issued. The model call is already in flight and already
    // billed: cancelling burns the spend and returns nothing, and re-POSTing bills again.
    expect(api.startReview).not.toHaveBeenCalled();
    // The port carries no cancel method at all — the write surface is one endpoint.
    expect(api).not.toHaveProperty('cancelRun');
  });

  it('treats a run_id absent from the list as STILL RUNNING, never as done', async () => {
    // The row races the response that returned its id. Mistaking "not there yet" for
    // "finished" would return an empty review for a review the user paid for.
    const api = mockApi(async () => []);
    const { sleep } = fakeSleep();

    const result = await waitForRun(api, PR_ID, RUN_ID, { ...OPTIONS, sleep });

    expect(result.status).toBe('timeout');
    expect(result.run).toBeNull();
    expect(api.listRuns).toHaveBeenCalledTimes(3);
  });

  it('treats a null status as still running', async () => {
    const statuses: (string | null)[] = [null, 'done'];
    const api = mockApi(async () => [run({ status: statuses.shift() ?? null })]);
    const { sleep } = fakeSleep();

    const result = await waitForRun(api, PR_ID, RUN_ID, { ...OPTIONS, sleep });

    expect(result.status).toBe('done');
    expect(api.listRuns).toHaveBeenCalledTimes(2);
  });
});
