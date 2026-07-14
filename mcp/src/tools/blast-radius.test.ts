/**
 * `get_blast_radius` — the stub's tests.
 *
 * Two of the three assertions here are about a tool that does nothing, which is the
 * point: the STUB is temporary, the CONTRACT is not. The schema-keys test is the
 * regression test that fails the day someone "helpfully" changes the arguments before
 * the tool is wired — at which point every already-written host prompt and every
 * example in `specs/tools.md` silently rots.
 *
 * No MCP SDK server is constructed: `registerTool` is the only surface this file
 * touches, so a capturing test double is both sufficient and faster than booting a
 * transport.
 */
import { describe, expect, it } from 'vitest';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

import { NOT_IMPLEMENTED_BLAST } from '../errors.js';
import { registerBlastRadiusTool } from './blast-radius.js';
import { BLAST_RADIUS_STUB_MESSAGE } from './blast-radius.constants.js';

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
    content: { type: string; text: string }[];
  }>;
}

/** Captures the registration instead of speaking the protocol. */
function captureRegistration(): CapturedTool {
  let captured: CapturedTool | undefined;
  const server = {
    registerTool: (name: string, config: CapturedTool['config'], handler: CapturedTool['handler']) => {
      captured = { name, config, handler };
    },
  } as unknown as McpServer;

  registerBlastRadiusTool(server);
  if (!captured) throw new Error('registerBlastRadiusTool registered nothing');
  return captured;
}

const FROZEN_DESCRIPTION =
  'Which symbols a pull request changes and what downstream code calls them. NOT IMPLEMENTED YET — calling it returns instructions, not data.';

describe('get_blast_radius — the registration (the LOCKED contract)', () => {
  it('registers under the locked name, with the frozen description', () => {
    const tool = captureRegistration();

    expect(tool.name).toBe('get_blast_radius');
    expect(tool.config.description).toBe(FROZEN_DESCRIPTION);
  });

  it('takes exactly the REAL args — inputSchema keys are ["repo", "pr"]', () => {
    // The contract-stability regression test. These are the arguments the tool will
    // take once it IS wired; freezing them now is what makes finishing it a
    // one-function change instead of a re-plumbing of every caller.
    const tool = captureRegistration();

    expect(Object.keys(tool.config.inputSchema ?? {})).toEqual(['repo', 'pr']);
  });

  it('declares NO outputSchema, and is annotated read-only', () => {
    // An outputSchema would oblige the handler to return a matching
    // `structuredContent` — which a stub cannot produce.
    const tool = captureRegistration();

    expect(tool.config.outputSchema).toBeUndefined();
    expect(tool.config.annotations).toMatchObject({ readOnlyHint: true, openWorldHint: true });
  });
});

describe('get_blast_radius — the handler', () => {
  it('returns isError: true with the not-implemented message', async () => {
    // isError is TRUE here on purpose (unlike run_agent_on_pr's timeout path): the call
    // is free, there is no spend to protect, and no retry could cost money.
    const tool = captureRegistration();

    const result = await tool.handler({ repo: 'acme/payments-api', pr: 482 }, {});

    expect(result.isError).toBe(true);
    expect(result.content).toHaveLength(1);
    expect(result.content[0]?.type).toBe('text');
    expect(result.content[0]?.text).toBe(BLAST_RADIUS_STUB_MESSAGE);
  });

  it('leads onward (P4): the message names get_findings as the next tool', async () => {
    const tool = captureRegistration();

    const text = (await tool.handler({ repo: 'acme/payments-api', pr: 482 }, {})).content[0]?.text ?? '';

    expect(text).toMatch(/not implemented/i);
    expect(text).toContain('get_findings');
  });

  it('states the three implementation steps, and that the missing piece is an HTTP route', async () => {
    const tool = captureRegistration();

    const text = (await tool.handler({ repo: 'acme/payments-api', pr: 482 }, {})).content[0]?.text ?? '';

    // (1) a route in the server, (2) ApiPort + http-client, (3) a service method.
    expect(text).toMatch(/\(1\)[\s\S]*route[\s\S]*repo-intel/i);
    expect(text).toMatch(/\(2\)[\s\S]*ApiPort[\s\S]*http-client/i);
    expect(text).toMatch(/\(3\)[\s\S]*service method/i);

    // The diagnosis: engine + contract exist; only the HTTP route is missing.
    expect(text).toMatch(/NO HTTP route|no HTTP route/);
    expect(text).toContain('repo-intel/service.ts:220');
    expect(text).toContain('contracts/brief.ts');
  });

  it('composes the domain-ring message — one source of truth, not a second copy', () => {
    // If someone forks the prose into this folder, these two drift on the first edit.
    expect(BLAST_RADIUS_STUB_MESSAGE).toContain(NOT_IMPLEMENTED_BLAST);
  });
});
