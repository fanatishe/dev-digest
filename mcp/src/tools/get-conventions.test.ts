import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { describe, expect, it, vi } from 'vitest';
import type { ApiPort } from '../ports.js';
import { CatalogService } from '../services/catalog.service.js';
import type { ConventionCandidate, Repo } from '../types.js';
import { registerGetConventionsTool } from './get-conventions.js';
import type { McpConfig } from '../ports.js';

const REPO_ID = '11111111-1111-4111-8111-111111111111';

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

function mockApi(over: Partial<ApiPort> = {}): ApiPort {
  return {
    health: vi.fn(async () => ({ status: 'ok' })),
    listRepos: vi.fn(async () => [repo()]),
    listPulls: vi.fn(async () => []),
    listAgents: vi.fn(async () => []),
    startReview: vi.fn(async () => {
      throw new Error('get_conventions must never start a review');
    }),
    listRuns: vi.fn(async () => []),
    listReviews: vi.fn(async () => []),
    listConventions: vi.fn(async () => [convention()]),
    ...over,
  };
}

// ---- A capture-only stand-in for McpServer: the SDK is not the unit under test -----

interface ToolResult {
  content: Array<{ type: string; text: string }>;
  structuredContent?: Record<string, unknown>;
  isError?: boolean;
}

interface Registration {
  config: {
    description?: string;
    inputSchema?: Record<string, unknown>;
    outputSchema?: Record<string, unknown>;
    annotations?: { readOnlyHint?: boolean };
  };
  handler: (args: unknown, extra: unknown) => Promise<ToolResult>;
}

function registerWith(api: ApiPort): Registration {
  const registered = new Map<string, Registration>();
  const server = {
    registerTool: (name: string, config: Registration['config'], handler: Registration['handler']) =>
      registered.set(name, { config, handler }),
  } as unknown as McpServer;

const CONFIG: McpConfig = {
  apiUrl: 'http://localhost:3001',
  pollIntervalMs: 1_000,
  firstPollDelayMs: 1_000,
  runTimeoutMs: 3_000,
  httpTimeoutMs: 30_000,
  cacheTtlMs: 60_000,
};


  registerGetConventionsTool(server, new CatalogService(api, CONFIG));

  const registration = registered.get('get_conventions');
  if (!registration) throw new Error('get_conventions was not registered');
  return registration;
}

interface Args {
  repo: string;
  accepted_only: boolean;
  limit: number;
}

const DEFAULT_ARGS: Args = { repo: 'acme/payments-api', accepted_only: false, limit: 20 };

const call = (reg: Registration, args: Partial<Args> = {}): Promise<ToolResult> =>
  reg.handler({ ...DEFAULT_ARGS, ...args }, {});

describe('get_conventions — registration', () => {
  it('takes three flat scalars and is declared read-only', () => {
    const { config } = registerWith(mockApi());

    expect(Object.keys(config.inputSchema ?? {})).toEqual(['repo', 'accepted_only', 'limit']);
    // Extraction is a PAID model call and is deliberately not exposed: this tool reads.
    expect(config.annotations?.readOnlyHint).toBe(true);
    expect(config.description).toContain('Read-only');
  });
});

describe('get_conventions — handler', () => {
  it('returns projected conventions plus a summary that is NOT the JSON', async () => {
    const result = await call(registerWith(mockApi()));

    expect(result.structuredContent).toEqual({
      repo: 'acme/payments-api',
      conventions: [
        {
          rule: 'Routes declare a Zod schema',
          evidence_path: 'server/src/modules/pulls/routes.ts',
          evidence_snippet: 'const Body = z.object({ agentId: z.string() });',
          confidence: 0.9,
          accepted: true,
        },
      ],
      total: 1,
      next: null,
    });

    const text = result.content[0]?.text ?? '';
    expect(text).toContain('Routes declare a Zod schema');
    expect(text).toContain('grounded in server/src/modules/pulls/routes.ts');
    // A summary, never JSON.stringify of the structuredContent.
    expect(text).not.toContain('"rule"');
    expect(text).not.toContain('evidence_sha');
  });

  it('surfaces the truncation hint in the text when the list is capped', async () => {
    const api = mockApi({
      listConventions: vi.fn(async () =>
        Array.from({ length: 5 }, (_, i) => convention({ id: `c${i}`, rule: `rule ${i}` })),
      ),
    });

    const result = await call(registerWith(api), { limit: 2 });

    expect(result.structuredContent?.total).toBe(5);
    expect(result.content[0]?.text).toContain(
      'Showing 2 of 5 conventions. Call get_conventions again with limit=5 for the rest.',
    );
  });

  it('tells the model where to extract them when the repo has none', async () => {
    const api = mockApi({ listConventions: vi.fn(async () => []) });

    const result = await call(registerWith(api));
    const text = result.content[0]?.text ?? '';

    expect(text).toMatch(/DevDigest UI/);
    expect(text).toMatch(/get_conventions/);
    expect(result.isError).toBeUndefined();
  });

  it('issues no write — startReview is never called, and extraction is never triggered', async () => {
    const api = mockApi();
    await call(registerWith(api), { accepted_only: true });

    expect(api.startReview).not.toHaveBeenCalled();
    expect(api.listConventions).toHaveBeenCalledTimes(1);
  });
});
