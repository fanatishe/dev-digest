import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { describe, expect, it, vi } from 'vitest';
import type { ApiPort } from '../ports.js';
import { CatalogService } from '../services/catalog.service.js';
import type { Agent } from '../types.js';
import { registerListAgentsTool } from './list-agents.js';
import type { McpConfig } from '../ports.js';

const AGENT_ID = '33333333-3333-4333-8333-333333333333';
const SYSTEM_PROMPT = 'SYSTEM PROMPT — multi-KB, must never reach the model'.repeat(40);

const agent = (over: Partial<Agent> = {}): Agent => ({
  id: AGENT_ID,
  name: 'Security',
  description: 'Security reviewer',
  provider: 'openai',
  model: 'gpt-4.1',
  system_prompt: SYSTEM_PROMPT,
  output_schema: null,
  enabled: true,
  version: 1,
  strategy: 'single-pass',
  ci_fail_on: 'critical',
  repo_intel: true,
  ...over,
});

function mockApi(over: Partial<ApiPort> = {}): ApiPort {
  return {
    health: vi.fn(async () => ({ status: 'ok' })),
    listRepos: vi.fn(async () => []),
    listPulls: vi.fn(async () => []),
    listAgents: vi.fn(async () => [agent()]),
    startReview: vi.fn(async () => {
      throw new Error('list_agents must never start a review');
    }),
    listRuns: vi.fn(async () => []),
    listReviews: vi.fn(async () => []),
    listConventions: vi.fn(async () => []),
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


  registerListAgentsTool(server, new CatalogService(api, CONFIG));

  const registration = registered.get('list_agents');
  if (!registration) throw new Error('list_agents was not registered');
  return registration;
}

const call = (reg: Registration): Promise<ToolResult> => reg.handler({}, {});

describe('list_agents — registration', () => {
  it('takes zero arguments and is declared read-only', () => {
    const { config } = registerWith(mockApi());

    expect(config.inputSchema).toEqual({});
    expect(config.annotations?.readOnlyHint).toBe(true);
    expect(config.description).toContain('Call this first');
  });
});

describe('list_agents — handler', () => {
  it('returns structuredContent with no system_prompt, plus a summary that is NOT the JSON', async () => {
    const result = await call(registerWith(mockApi()));

    expect(result.structuredContent).toEqual({
      agents: [
        {
          id: AGENT_ID,
          name: 'Security',
          description: 'Security reviewer',
          model: 'gpt-4.1',
          enabled: true,
        },
      ],
      total: 1,
    });

    const [block] = result.content;
    expect(block?.type).toBe('text');
    // The `content` block is a SUMMARY, never JSON.stringify of the same payload —
    // emitting it twice doubles the token cost for zero gain.
    expect(block?.text).not.toContain('{"');
    expect(block?.text).toContain('Security');
    expect(block?.text).not.toContain('SYSTEM PROMPT');
  });

  it('names the next action when no agents are configured', async () => {
    const result = await call(registerWith(mockApi({ listAgents: vi.fn(async () => []) })));

    const text = result.content[0]?.text ?? '';
    expect(text).toMatch(/db:seed/);
    expect(text).toMatch(/DevDigest UI/);
    expect(text).toMatch(/list_agents/);
    // Empty is a next step, not a failure: an error result invites a pointless retry.
    expect(result.isError).toBeUndefined();
    expect(result.structuredContent).toEqual({ agents: [], total: 0 });
  });

  it('issues no write — startReview is never called', async () => {
    const api = mockApi();
    await call(registerWith(api));

    expect(api.startReview).not.toHaveBeenCalled();
  });
});
