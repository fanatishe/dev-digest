/**
 * TRANSPORT ring — `list_agents`.
 *
 * The registration is the LOCKED contract (plan §5.0/§5.1): name, title, description,
 * inputSchema and annotations are frozen and must not be reworded. The handler is thin
 * by design — one service call, then format:
 *
 *   `structuredContent` (matching `outputSchema`) + ONE markdown `content` block that
 *   SUMMARIZES it. Never `JSON.stringify` of the same payload — that would bill the
 *   host for the identical bytes twice.
 *
 * `readOnlyHint: true`: this tool never writes, and there is exactly one write tool in
 * this server (`run_agent_on_pr`).
 */
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { noAgentsMessage } from '../errors.js';
import { agentsMarkdown } from '../format.js';
import { AgentSummary } from '../schemas.js';
import type { CatalogService } from '../services/catalog.service.js';

export function registerListAgentsTool(server: McpServer, catalog: CatalogService): void {
  server.registerTool(
    'list_agents',
    {
      title: 'List reviewer agents',
      description:
        'List the reviewer agents configured in DevDigest. Call this first to get a valid `agent` id for run_agent_on_pr.',
      // Zero arguments. A RAW ZOD SHAPE — never z.object({}).
      inputSchema: {},
      // Also a raw shape. `system_prompt` is absent from `AgentSummary` by construction.
      outputSchema: {
        agents: z.array(AgentSummary),
        total: z.number().int(),
      },
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    async () => {
      const result = await catalog.listAgents();

      // Empty is not an error — it is a next step (P4, errors lead onward).
      const text = result.total === 0 ? noAgentsMessage() : agentsMarkdown(result.agents);

      return { structuredContent: { ...result }, content: [{ type: 'text', text }] };
    },
  );
}
