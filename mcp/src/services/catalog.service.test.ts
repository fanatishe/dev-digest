import { describe, expect, it, vi } from 'vitest';
import { ApiUnreachableError, ToolError } from '../errors.js';
import type { ApiPort } from '../ports.js';
import type { Agent, ConventionCandidate, Repo } from '../types.js';
import { CatalogService } from './catalog.service.js';
import type { McpConfig } from '../ports.js';

const REPO_ID = '11111111-1111-4111-8111-111111111111';
const AGENT_ID = '33333333-3333-4333-8333-333333333333';

/** Multi-KB in production; this stand-in is unmistakable if it ever leaks. */
const SYSTEM_PROMPT = 'SYSTEM PROMPT — multi-KB, must never reach the model'.repeat(40);

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

const agent = (over: Partial<Agent> = {}): Agent => ({
  id: AGENT_ID,
  name: 'Security',
  description: 'Security reviewer',
  provider: 'openai',
  model: 'gpt-4.1',
  system_prompt: SYSTEM_PROMPT,
  output_schema: { type: 'object' },
  enabled: true,
  version: 3,
  strategy: 'single-pass',
  ci_fail_on: 'critical',
  repo_intel: true,
  ...over,
});

const convention = (over: Partial<ConventionCandidate> = {}): ConventionCandidate => ({
  id: 'c1',
  rule: 'Routes declare a Zod schema',
  evidence_path: 'server/src/modules/pulls/routes.ts',
  evidence_snippet: 'const Body = z.object({ agentId: z.string() });',
  evidence_sha: 'deadbeefdeadbeefdeadbeefdeadbeefdeadbeef',
  confidence: 0.9,
  accepted: true,
  ...over,
});

/** A plain mock object — no `fetch` stubbing, no HTTP. That is what the port buys. */
function mockApi(over: Partial<ApiPort> = {}): ApiPort {
  return {
    health: vi.fn(async () => ({ status: 'ok' })),
    listRepos: vi.fn(async () => [repo()]),
    listPulls: vi.fn(async () => []),
    listAgents: vi.fn(async () => [agent()]),
    startReview: vi.fn(async () => {
      throw new Error('the catalog service must never start a review');
    }),
    listRuns: vi.fn(async () => []),
    listReviews: vi.fn(async () => []),
    listConventions: vi.fn(async () => [convention()]),
    ...over,
  };
}

const CONFIG: McpConfig = {
  apiUrl: 'http://localhost:3001',
  pollIntervalMs: 1_000,
  firstPollDelayMs: 1_000,
  runTimeoutMs: 3_000,
  httpTimeoutMs: 30_000,
  cacheTtlMs: 60_000,
};


describe('CatalogService.listAgents', () => {
  it('projects an agent to exactly the five actionable fields', async () => {
    const result = await new CatalogService(mockApi(), CONFIG).listAgents();

    expect(result.total).toBe(1);
    expect(result.agents[0]).toEqual({
      id: AGENT_ID,
      name: 'Security',
      description: 'Security reviewer',
      model: 'gpt-4.1',
      enabled: true,
    });
  });

  it('DROPS system_prompt — the biggest response-bloat source in the surface', async () => {
    // Two agents, one of them disabled: the projection must hold for every row.
    const api = mockApi({
      listAgents: vi.fn(async () => [agent(), agent({ id: 'a2', name: 'Perf', enabled: false })]),
    });

    const result = await new CatalogService(api, CONFIG).listAgents();

    // Field-by-field, so reintroducing ANY of them fails this test — not just the big one.
    for (const summary of result.agents) {
      for (const dropped of [
        'system_prompt',
        'output_schema',
        'version',
        'strategy',
        'ci_fail_on',
        'repo_intel',
        'provider',
      ]) {
        expect(summary).not.toHaveProperty(dropped);
      }
    }
    // …and belt-and-braces on the serialized payload the model would actually pay for.
    expect(JSON.stringify(result)).not.toContain('SYSTEM PROMPT');
  });

  it('returns an empty list rather than throwing when no agents are configured', async () => {
    const api = mockApi({ listAgents: vi.fn(async () => []) });

    await expect(new CatalogService(api, CONFIG).listAgents()).resolves.toEqual({ agents: [], total: 0 });
  });
});

describe('CatalogService.getConventions', () => {
  const input = { repo: 'acme/payments-api', acceptedOnly: false, limit: 20 };

  it('resolves the repo by slug and projects each convention', async () => {
    const api = mockApi();
    const result = await new CatalogService(api, CONFIG).getConventions(input);

    expect(api.listConventions).toHaveBeenCalledWith(REPO_ID);
    expect(result.repo).toBe('acme/payments-api');
    expect(result.total).toBe(1);
    expect(result.conventions[0]).toEqual({
      rule: 'Routes declare a Zod schema',
      evidence_path: 'server/src/modules/pulls/routes.ts',
      evidence_snippet: 'const Body = z.object({ agentId: z.string() });',
      confidence: 0.9,
      accepted: true,
    });
    expect(result.next).toBeNull();
  });

  it('drops id and evidence_sha, and truncates evidence_snippet at 200 chars', async () => {
    const snippet = 'x'.repeat(500);
    const api = mockApi({
      listConventions: vi.fn(async () => [convention({ evidence_snippet: snippet })]),
    });

    const result = await new CatalogService(api, CONFIG).getConventions(input);
    const [projected] = result.conventions;

    expect(projected).not.toHaveProperty('id');
    expect(projected).not.toHaveProperty('evidence_sha');
    expect(projected?.evidence_snippet).toBe(`${'x'.repeat(200)}…`);
  });

  it('filters to accepted conventions when accepted_only is set', async () => {
    const api = mockApi({
      listConventions: vi.fn(async () => [
        convention({ id: 'c1', rule: 'accepted one', accepted: true }),
        convention({ id: 'c2', rule: 'rejected one', accepted: false }),
      ]),
    });
    const service = new CatalogService(api, CONFIG);

    const all = await service.getConventions({ ...input, acceptedOnly: false });
    expect(all.total).toBe(2);

    const accepted = await service.getConventions({ ...input, acceptedOnly: true });
    expect(accepted.total).toBe(1);
    expect(accepted.conventions.map((c) => c.rule)).toEqual(['accepted one']);
  });

  it('caps at `limit` and hints how to get the rest — but only when there IS a rest', async () => {
    const api = mockApi({
      listConventions: vi.fn(async () =>
        Array.from({ length: 7 }, (_, i) => convention({ id: `c${i}`, rule: `rule ${i}` })),
      ),
    });
    const service = new CatalogService(api, CONFIG);

    const capped = await service.getConventions({ ...input, limit: 3 });
    expect(capped.conventions).toHaveLength(3);
    expect(capped.total).toBe(7);
    expect(capped.next).toBe(
      'Showing 3 of 7 conventions. Call get_conventions again with limit=7 for the rest.',
    );

    // A hint on a complete list is a lie that costs a wasted call.
    const whole = await service.getConventions({ ...input, limit: 20 });
    expect(whole.conventions).toHaveLength(7);
    expect(whole.next).toBeNull();
  });

  it('counts the FILTERED total, so the hint never promises rows accepted_only removed', async () => {
    const api = mockApi({
      listConventions: vi.fn(async () => [
        convention({ id: 'c1', accepted: true }),
        convention({ id: 'c2', accepted: false }),
        convention({ id: 'c3', accepted: false }),
      ]),
    });

    const result = await new CatalogService(api, CONFIG).getConventions({
      ...input,
      acceptedOnly: true,
      limit: 1,
    });

    expect(result.total).toBe(1);
    expect(result.next).toBeNull();
  });

  it('leads onward when nothing has been extracted — and never offers to extract it here', async () => {
    const api = mockApi({ listConventions: vi.fn(async () => []) });

    const result = await new CatalogService(api, CONFIG).getConventions(input);

    expect(result.conventions).toEqual([]);
    expect(result.total).toBe(0);
    expect(result.next).toMatch(/DevDigest UI/);
    expect(result.next).toMatch(/get_conventions/);
    // Extraction is a PAID model call: the message says who pays, and it isn't this tool.
    expect(result.next).toMatch(/paid model call/);
  });

  it('leads onward when the repo is not imported', async () => {
    const api = mockApi({ listRepos: vi.fn(async () => []) });

    await expect(new CatalogService(api, CONFIG).getConventions(input)).rejects.toThrow(ToolError);
    await expect(new CatalogService(api, CONFIG).getConventions(input)).rejects.toThrow(/DevDigest UI/);
    expect(api.listConventions).not.toHaveBeenCalled();
  });
});

describe('CatalogService — the API is down', () => {
  it('turns "unreachable" into the message that names ./scripts/dev.sh', async () => {
    const down = (): never => {
      throw new ApiUnreachableError('http://localhost:3001');
    };
    const api = mockApi({ listAgents: vi.fn(down), listRepos: vi.fn(down) });
    const service = new CatalogService(api, CONFIG);

    await expect(service.listAgents()).rejects.toThrow(ToolError);
    await expect(service.listAgents()).rejects.toThrow(/\.\/scripts\/dev\.sh/);
    await expect(service.listAgents()).rejects.toThrow(/http:\/\/localhost:3001/);

    await expect(
      service.getConventions({ repo: 'acme/payments-api', acceptedOnly: false, limit: 20 }),
    ).rejects.toThrow(/\.\/scripts\/dev\.sh/);
  });
});

describe('CatalogService — the read-only contract', () => {
  it('never calls a write method on the port', async () => {
    const api = mockApi();
    const service = new CatalogService(api, CONFIG);

    await service.listAgents();
    await service.getConventions({ repo: 'acme/payments-api', acceptedOnly: false, limit: 20 });

    // The port has exactly one write, and this service must never reach it. (There is no
    // conventions-extract method on the port at all — extraction is a paid call by design.)
    expect(api.startReview).not.toHaveBeenCalled();
  });
});
