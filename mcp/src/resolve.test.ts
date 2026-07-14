import { describe, expect, it, vi } from 'vitest';
import { ToolError } from './errors.js';
import { isUuid, resolveAgent, resolvePr, resolveRepo, resolveTarget } from './resolve.js';
import type { ApiPort } from './ports.js';
import type { Agent, PrMeta, Repo } from './types.js';

const REPO_ID = '11111111-1111-4111-8111-111111111111';
const PR_ID = '22222222-2222-4222-8222-222222222222';
const AGENT_ID = '33333333-3333-4333-8333-333333333333';

const repo = (over: Partial<Repo> = {}): Repo => ({
  id: REPO_ID,
  workspace_id: 'ws',
  owner: 'acme',
  name: 'payments-api',
  full_name: 'acme/payments-api',
  default_branch: 'main',
  clone_path: null,
  last_polled_at: null,
  created_by: null,
  ...over,
});

const pr = (over: Partial<PrMeta> = {}): PrMeta => ({
  id: PR_ID,
  number: 482,
  title: 'Add rate limiting',
  author: 'dev',
  branch: 'feat/rl',
  base: 'main',
  head_sha: 'abc',
  additions: 10,
  deletions: 2,
  files_count: 3,
  status: 'needs_review',
  ...over,
});

const agent = (over: Partial<Agent> = {}): Agent => ({
  id: AGENT_ID,
  name: 'Security',
  description: 'Security reviewer',
  provider: 'openai',
  model: 'gpt-4.1',
  system_prompt: 'SECRET-ISH LONG PROMPT',
  enabled: true,
  version: 1,
  strategy: 'single-pass',
  ci_fail_on: 'critical',
  repo_intel: true,
  ...over,
});

/** A plain mock object — no `fetch` stubbing, no HTTP. That is what the port buys. */
function mockApi(over: Partial<ApiPort> = {}): ApiPort {
  return {
    health: vi.fn(async () => ({ status: 'ok' })),
    listRepos: vi.fn(async () => [repo()]),
    listPulls: vi.fn(async () => [pr()]),
    listAgents: vi.fn(async () => [agent()]),
    startReview: vi.fn(async () => {
      throw new Error('resolve must never start a review');
    }),
    listRuns: vi.fn(async () => []),
    listReviews: vi.fn(async () => []),
    listConventions: vi.fn(async () => []),
    ...over,
  };
}

describe('isUuid', () => {
  it('accepts a uuid and rejects a slug, a number and a name', () => {
    expect(isUuid(REPO_ID)).toBe(true);
    expect(isUuid('acme/payments-api')).toBe(false);
    expect(isUuid('482')).toBe(false);
    expect(isUuid('Security')).toBe(false);
  });
});

describe('resolveRepo', () => {
  it('resolves by slug, case-insensitively, and by uuid', async () => {
    const api = mockApi();
    expect((await resolveRepo(api, 'acme/payments-api')).id).toBe(REPO_ID);
    expect((await resolveRepo(api, 'ACME/Payments-API')).id).toBe(REPO_ID);
    expect((await resolveRepo(api, REPO_ID)).id).toBe(REPO_ID);
  });

  it('leads onward when the repo is not imported, and lists what is', async () => {
    const api = mockApi();
    await expect(resolveRepo(api, 'acme/ghost')).rejects.toThrow(ToolError);
    await expect(resolveRepo(api, 'acme/ghost')).rejects.toThrow(/acme\/payments-api/);
    await expect(resolveRepo(api, 'acme/ghost')).rejects.toThrow(/DevDigest UI/);
  });

  it('does not accept a stale uuid that no longer exists', async () => {
    const api = mockApi({ listRepos: vi.fn(async () => []) });
    await expect(resolveRepo(api, REPO_ID)).rejects.toThrow(ToolError);
  });
});

describe('resolvePr', () => {
  it('resolves by number, by number-as-string, and by uuid', async () => {
    const api = mockApi();
    expect((await resolvePr(api, repo(), 482)).id).toBe(PR_ID);
    expect((await resolvePr(api, repo(), '482')).id).toBe(PR_ID);
    expect((await resolvePr(api, repo(), PR_ID)).id).toBe(PR_ID);
  });

  it('lists the open PRs when the number is wrong', async () => {
    const api = mockApi();
    await expect(resolvePr(api, repo(), 999)).rejects.toThrow(/#482/);
  });

  it('explains a PR that GitHub knows but DevDigest has not synced (PrMeta.id is nullish)', async () => {
    const api = mockApi({ listPulls: vi.fn(async () => [pr({ id: null })]) });
    await expect(resolvePr(api, repo(), 482)).rejects.toThrow(/has not been synced/);
    await expect(resolvePr(api, repo(), 482)).rejects.toThrow(/DevDigest UI/);
  });
});

describe('resolveAgent', () => {
  it('resolves by uuid and by name, case-insensitively', async () => {
    const api = mockApi();
    expect((await resolveAgent(api, AGENT_ID)).id).toBe(AGENT_ID);
    expect((await resolveAgent(api, 'Security')).id).toBe(AGENT_ID);
    expect((await resolveAgent(api, 'security')).id).toBe(AGENT_ID);
  });

  it('NEVER yields a non-uuid agent id — a name would 500 on the uuid column', async () => {
    const api = mockApi();
    for (const input of [AGENT_ID, 'Security', 'security']) {
      const resolved = await resolveAgent(api, input);
      expect(isUuid(resolved.id)).toBe(true);
    }
    // …and an unknown name throws instead of being forwarded.
    await expect(resolveAgent(api, 'secuirty')).rejects.toThrow(ToolError);
    await expect(resolveAgent(api, 'secuirty')).rejects.toThrow(/call list_agents/);
  });

  it('says how to seed when no agents exist at all', async () => {
    const api = mockApi({ listAgents: vi.fn(async () => []) });
    await expect(resolveAgent(api, 'Security')).rejects.toThrow(/db:seed/);
  });

  it('resolution issues no write — startReview is never called', async () => {
    const api = mockApi();
    await resolveAgent(api, 'Security');
    await resolveTarget(api, 'acme/payments-api', 482);
    expect(api.startReview).not.toHaveBeenCalled();
  });
});

describe('resolveTarget', () => {
  it('returns the repo row and the synced PR', async () => {
    const api = mockApi();
    const target = await resolveTarget(api, 'acme/payments-api', '482');
    expect(target.repo.full_name).toBe('acme/payments-api');
    expect(target.pr.id).toBe(PR_ID);
    expect(api.listPulls).toHaveBeenCalledWith(REPO_ID);
  });
});
