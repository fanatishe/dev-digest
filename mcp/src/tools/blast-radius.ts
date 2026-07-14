/**
 * TRANSPORT ring — `get_blast_radius`. A TRUE STUB, by design (plan §5.5).
 *
 * The registration is the deliverable. Name, title, description, `inputSchema` and
 * annotations are the LOCKED contract and are the REAL ones — `{ repo, pr }`, frozen
 * now precisely so that wiring the tool later changes nothing outside this handler's
 * body. `blast-radius.test.ts` guards that with a regression test on the schema keys.
 *
 * Why a stub at all: DevDigest computes a blast radius internally
 * (`container.repoIntel.getBlastRadius()`, server/src/modules/repo-intel/service.ts:220)
 * and the `BlastRadius` contract exists — but `repo-intel/routes.ts` exposes NO HTTP
 * route for it, and this package reaches DevDigest over HTTP only. It physically
 * cannot call the engine. Adding that route is the exercise; the message says so.
 *
 * Two deliberate absences:
 *  - **No `outputSchema`.** Declaring one would oblige the handler to return a
 *    `structuredContent` matching it — which it cannot produce.
 *  - **No `ApiPort`, no service.** It makes no call, so it takes no port. A parameter
 *    it never uses would be a lie about the dependency graph.
 *
 * `isError: true` is right HERE, unlike `run_agent_on_pr`'s timeout path (which is
 * deliberately `isError: false`): there is no spend to protect and no retry that could
 * cost money. The call is free, it will fail the same way every time, and the model
 * should see it as a failure so it moves on — to `get_findings`.
 */
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

import { prArg, repoArg } from '../schemas.js';
import { BLAST_RADIUS_STUB_MESSAGE } from './blast-radius.constants.js';

export function registerBlastRadiusTool(server: McpServer): void {
  server.registerTool(
    'get_blast_radius',
    {
      title: 'Get the blast radius of a pull request',
      description:
        'Which symbols a pull request changes and what downstream code calls them. NOT IMPLEMENTED YET — calling it returns instructions, not data.',
      // The REAL schema — frozen now, unchanged when wired. RAW ZOD SHAPE.
      inputSchema: { repo: repoArg, pr: prArg },
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    async () => ({
      isError: true,
      content: [{ type: 'text', text: BLAST_RADIUS_STUB_MESSAGE }],
    }),
  );
}
