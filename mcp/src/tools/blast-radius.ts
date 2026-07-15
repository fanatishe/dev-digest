/**
 * TRANSPORT ring — `get_blast_radius`. WIRED (was a stub until L04).
 *
 * The stub's message named three steps to finish it: (1) a route in the server,
 * (2) `getBlastRadius()` on `ApiPort` + `http-client.ts`, (3) a service method and a
 * new handler body. All three landed, and — the point of the whole exercise — the
 * `name` and `inputSchema` did NOT change. `{ repo, pr }` was frozen before the tool
 * could do anything, so wiring it touched nothing that a host prompt or a doc had
 * already committed to. `blast-radius.test.ts` still guards those keys.
 *
 * Two deliberate changes from the stub:
 *  - **`outputSchema` now exists.** The stub had none because declaring one obliges
 *    the handler to return matching `structuredContent`, which a stub cannot produce.
 *    It can now.
 *  - **`isError` is gone.** It was right for a call that would fail identically every
 *    time. A degraded index is not a failure: it is a real, partial answer, and it is
 *    reported in-band via `degraded` + `next` so the model can act on it.
 *
 * The DESCRIPTION changed too — it used to end "NOT IMPLEMENTED YET". Descriptions in
 * this package are frozen because they load into the host's context at chat start and
 * are how a model chooses between tools; but a frozen description that lies about what
 * the tool does is worse than an edited one.
 *
 * FREE. The route reads a pre-built index; it makes no model call.
 */
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';

import { BlastImpactSummary, BlastSymbolSummary, prArg, repoArg } from '../schemas.js';
import type { BlastService } from '../services/blast.service.js';

export function registerBlastRadiusTool(server: McpServer, blast: BlastService): void {
  server.registerTool(
    'get_blast_radius',
    {
      title: 'Get the blast radius of a pull request',
      description:
        'Which symbols a pull request changes, what downstream code calls them, and which HTTP endpoints and cron jobs those callers put at risk. Answers "what could this break?" — the question the diff itself cannot. Read-only and free: it reads a pre-built code index, and makes no model call.',
      // The REAL schema — frozen since the stub, unchanged now that it is wired.
      // RAW ZOD SHAPE, never `z.object({...})`.
      inputSchema: { repo: repoArg, pr: prArg },
      outputSchema: {
        repo: z.string(),
        pr: z.number().int(),
        summary: z.string(),
        changed_symbols: z.array(BlastSymbolSummary),
        downstream: z.array(BlastImpactSummary),
        endpoints_affected: z.array(z.string()),
        crons_affected: z.array(z.string()),
        // An empty blast radius means "nothing is affected" ONLY when this is false.
        // When it is true it means "we don't know" — and `next` says how to fix that.
        degraded: z
          .boolean()
          .describe('True when the code index is missing or partial — the result is INCOMPLETE.'),
        next: z.string().nullable(),
      },
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    async ({ repo, pr }) => {
      const result = await blast.getBlastRadius({ repo, pr });

      return {
        structuredContent: { ...result },
        // A SUMMARY of the payload — never `JSON.stringify` of it (that doubles the
        // token cost of every call for zero gain).
        content: [{ type: 'text', text: blast.markdown(result) }],
      };
    },
  );
}
