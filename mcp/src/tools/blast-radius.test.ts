/**
 * `get_blast_radius` — the WIRED tool (was a stub until L04).
 *
 * The schema-keys test below survived the un-stubbing UNCHANGED, and that is the whole
 * point: `{ repo, pr }` was frozen before the tool could do anything, so wiring it
 * broke no host prompt and no doc. It stays here as the regression guard it always was.
 *
 * No MCP SDK server and no `fetch`: `registerTool` is the only SDK surface this file
 * touches, and the service takes an `ApiPort` — so a capturing double plus a plain mock
 * object covers both, faster than booting a transport.
 */
import { describe, expect, it } from 'vitest';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

import type { ApiPort, McpConfig } from '../ports.js';
import { BlastService } from '../services/blast.service.js';
import { registerBlastRadiusTool } from './blast-radius.js';
import type { BlastRadius, PrMeta, Repo } from '../types.js';

interface CapturedTool {
  name: string;
  config: {
    title?: string;
    description?: string;
    inputSchema?: Record<string, unknown>;
    outputSchema?: Record<string, unknown>;
    annotations?: Record<string, unknown>;
  };
  handler: (...args: unknown[]) => Promise<{
    isError?: boolean;
    structuredContent?: Record<string, unknown>;
    content: { type: string; text: string }[];
  }>;
}

const REPO = { id: 'repo-uuid', full_name: 'acme/payments-api' } as Repo;
const PR = { id: 'pr-uuid', number: 482 } as PrMeta;

const BLAST: BlastRadius = {
  changed_symbols: [{ name: 'rateLimit', file: 'src/middleware/ratelimit.ts', kind: 'function' }],
  downstream: [
    {
      symbol: 'rateLimit',
      callers: Array.from({ length: 12 }, (_, i) => ({
        name: `caller${i}`,
        file: `src/api/f${i}.ts`,
        line: i + 1,
      })),
      endpoints_affected: ['GET /api/public/items', 'POST /api/public/webhooks'],
      crons_affected: ['reset-rate-buckets (hourly)'],
    },
  ],
  summary: '1 symbol · 12 callers · 2 endpoints · 1 cron/job',
  degraded: false,
  reason: null,
};

const config = { apiUrl: 'http://localhost:3001' } as McpConfig;

function mockApi(blast: BlastRadius): ApiPort {
  return {
    listRepos: async () => [REPO],
    listPulls: async () => [PR],
    getBlastRadius: async () => blast,
  } as unknown as ApiPort;
}

/** Captures the registration instead of speaking the protocol. */
function captureRegistration(blast: BlastRadius = BLAST): CapturedTool {
  let captured: CapturedTool | undefined;
  const server = {
    registerTool: (name: string, cfg: CapturedTool['config'], handler: CapturedTool['handler']) => {
      captured = { name, config: cfg, handler };
    },
  } as unknown as McpServer;

  registerBlastRadiusTool(server, new BlastService(mockApi(blast), config));
  if (!captured) throw new Error('registerBlastRadiusTool registered nothing');
  return captured;
}

describe('get_blast_radius — the registration (the LOCKED contract)', () => {
  it('registers under the locked name', () => {
    expect(captureRegistration().name).toBe('get_blast_radius');
  });

  it('STILL takes exactly ["repo", "pr"] — the args survived the un-stubbing', () => {
    // The contract-stability regression test, unchanged from when the tool was a stub.
    // Freezing these before the tool did anything is what made wiring it a
    // one-function change instead of a re-plumbing of every caller.
    expect(Object.keys(captureRegistration().config.inputSchema ?? {})).toEqual(['repo', 'pr']);
  });

  it('now declares an outputSchema, and is still annotated read-only', () => {
    const tool = captureRegistration();
    // The stub had none: an outputSchema obliges the handler to return matching
    // `structuredContent`, which a stub could not produce. It can now.
    expect(Object.keys(tool.config.outputSchema ?? {})).toContain('downstream');
    expect(tool.config.outputSchema).toHaveProperty('degraded');
    expect(tool.config.annotations).toMatchObject({ readOnlyHint: true, openWorldHint: true });
  });

  it('no longer describes itself as unimplemented', () => {
    const description = captureRegistration().config.description ?? '';
    expect(description).not.toMatch(/not implemented/i);
    expect(description).toMatch(/endpoint/i);
  });
});

describe('get_blast_radius — the handler', () => {
  it('returns symbols, callers and the endpoints they put at risk', async () => {
    const tool = captureRegistration();
    const res = await tool.handler({ repo: 'acme/payments-api', pr: 482 }, {});

    expect(res.isError).toBeUndefined(); // a real answer is not an error
    const sc = res.structuredContent!;
    expect(sc).toMatchObject({ repo: 'acme/payments-api', pr: 482, degraded: false });
    expect(sc['endpoints_affected']).toEqual([
      'GET /api/public/items',
      'POST /api/public/webhooks',
    ]);
    expect(sc['crons_affected']).toEqual(['reset-rate-buckets (hourly)']);
  });

  it('caps callers but keeps the TRUE total, so the truncation is visible', async () => {
    const tool = captureRegistration();
    const res = await tool.handler({ repo: 'acme/payments-api', pr: 482 }, {});
    const downstream = (
      res.structuredContent!['downstream'] as { callers: unknown[]; total_callers: number }[]
    )[0]!;

    expect(downstream.callers).toHaveLength(8); // MAX_CALLERS_SHOWN
    // Without this, a model would conclude it had seen all 12 call sites.
    expect(downstream.total_callers).toBe(12);
  });

  it('folds a caller to "file:line" rather than three keys', async () => {
    const tool = captureRegistration();
    const res = await tool.handler({ repo: 'acme/payments-api', pr: 482 }, {});
    const first = (res.structuredContent!['downstream'] as { callers: { at: string }[] }[])[0]!
      .callers[0]!;
    expect(first.at).toBe('src/api/f0.ts:1');
  });

  it('the markdown block SUMMARIZES — it is never a JSON dump', async () => {
    const tool = captureRegistration();
    const res = await tool.handler({ repo: 'acme/payments-api', pr: 482 }, {});
    const text = res.content[0]!.text;

    expect(text).toContain('rateLimit');
    expect(text).toContain('GET /api/public/items');
    // Stringifying `structuredContent` into the text block doubles the token cost of
    // every call for zero gain — the package-wide rule, asserted here.
    expect(text).not.toContain('{"');
  });

  it('a DEGRADED index says "unknown", not "nothing is affected"', async () => {
    // The dangerous case. An unindexed repo returns an EMPTY blast radius, which is
    // indistinguishable from "this change breaks nothing" unless the tool says so.
    const tool = captureRegistration({
      changed_symbols: [],
      downstream: [],
      summary: 'No indexed symbols in the changed files.',
      degraded: true,
      reason: 'no_data',
    });
    const res = await tool.handler({ repo: 'acme/payments-api', pr: 482 }, {});

    expect(res.structuredContent!['degraded']).toBe(true);
    const next = res.structuredContent!['next'] as string;
    expect(next).toMatch(/INCOMPLETE/);
    expect(next).toMatch(/not "nothing is affected"/);
    // …and it leads onward (P4).
    expect(next).toContain('get_findings');
  });
});
