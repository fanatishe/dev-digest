#!/usr/bin/env node
/**
 * TRANSPORT ring + COMPOSITION ROOT — `@devdigest/mcp`.
 *
 * The server analogue of `platform/container.ts`: the ONE place that constructs the
 * HTTP adapter and hands it to the application ring. Nothing else in this package
 * `new`s an adapter, and nothing else reads the environment.
 *
 * STDOUT BELONGS TO JSON-RPC. A single stray write to stdout (a `console` log call)
 * anywhere in this package corrupts the protocol frame and the host drops the
 * connection with an opaque parse error. Every log line — here and everywhere else in
 * this package — goes to STDERR via `console.error`. There is a grep in CI for it.
 */
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';

import { HttpApiClient } from './api/http-client.js';
import { loadConfig } from './config.js';
import { CatalogService } from './services/catalog.service.js';
import { ReviewService } from './services/review.service.js';
import { registerBlastRadiusTool } from './tools/blast-radius.js';
import { registerGetConventionsTool } from './tools/get-conventions.js';
import { registerGetFindingsTool } from './tools/get-findings.js';
import { registerListAgentsTool } from './tools/list-agents.js';
import { registerRunAgentOnPrTool } from './tools/run-agent-on-pr.js';

export const SERVER_NAME = 'devdigest';
export const SERVER_VERSION = '0.0.0';

async function main(): Promise<void> {
  const config = loadConfig();

  // ---- composition root: the only `new` of an adapter -------------------------
  const api = new HttpApiClient(config);
  const catalog = new CatalogService(api, config);
  const review = new ReviewService(api, config);

  const server = new McpServer(
    { name: SERVER_NAME, version: SERVER_VERSION },
    { capabilities: { tools: {} } },
  );

  registerListAgentsTool(server, catalog);
  registerRunAgentOnPrTool(server, review);
  registerGetFindingsTool(server, review);
  registerGetConventionsTool(server, catalog);
  registerBlastRadiusTool(server);

  await server.connect(new StdioServerTransport());

  // STDERR — stdout is the JSON-RPC frame.
  console.error(
    `[devdigest-mcp] ready on stdio · 5 tools · API ${config.apiUrl} ` +
      `(poll ${config.pollIntervalMs}ms, run timeout ${config.runTimeoutMs}ms)`,
  );
}

main().catch((err: unknown) => {
  console.error('[devdigest-mcp] fatal:', err instanceof Error ? err.message : err);
  process.exit(1);
});
