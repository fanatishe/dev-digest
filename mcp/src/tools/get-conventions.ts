/**
 * TRANSPORT ring — `get_conventions`.
 *
 * The registration is the LOCKED contract (plan §5.0/§5.4): name, title, description,
 * inputSchema and annotations are frozen and must not be reworded. The handler is thin:
 * one service call, then format — `structuredContent` plus ONE markdown `content` block
 * that summarizes it (never `JSON.stringify` of the same payload).
 *
 * Read-only ON PURPOSE, and `readOnlyHint: true` says so: extraction
 * (`POST /repos/:id/conventions/extract`) is a paid model call and is deliberately NOT
 * exposed. One write tool in this server, and one only.
 */
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { conventionsMarkdown } from '../format.js';
import { ConventionSummary, limitArg, repoArg } from '../schemas.js';
import type { CatalogService } from '../services/catalog.service.js';

export function registerGetConventionsTool(server: McpServer, catalog: CatalogService): void {
  server.registerTool(
    'get_conventions',
    {
      title: 'Get a repository’s extracted coding conventions',
      description:
        'Get the house-style coding conventions DevDigest extracted from a repository, each with the file and snippet it was grounded in. Read-only.',
      // RAW ZOD SHAPE. Flat scalars only (P2).
      inputSchema: {
        repo: repoArg,
        accepted_only: z.boolean().default(false),
        limit: limitArg.default(20),
      },
      // `id` and `evidence_sha` are absent from `ConventionSummary` by construction, and
      // `evidence_snippet` arrives truncated. `next` carries the onward step, if any.
      outputSchema: {
        repo: z.string(),
        conventions: z.array(ConventionSummary),
        total: z.number().int(),
        next: z.string().nullable(),
      },
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    async ({ repo, accepted_only, limit }) => {
      const result = await catalog.getConventions({ repo, acceptedOnly: accepted_only, limit });

      return {
        structuredContent: { ...result },
        content: [
          {
            type: 'text',
            text: conventionsMarkdown(result.repo, result.conventions, result.next),
          },
        ],
      };
    },
  );
}
