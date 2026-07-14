/**
 * TRANSPORT ring — `run_agent_on_pr`. The ONLY write tool in this server, and the
 * only one that spends money.
 *
 * PLACEHOLDER (WP0): the registration is FINAL — name, title, description,
 * inputSchema and annotations are the LOCKED contract (plan §5.0/§5.2) and must not
 * be reworded. **WP2 owns this file** and replaces only the handler body with
 * `await review.runOnPr({ repo, pr, agent })`.
 *
 * The annotations are load-bearing: `idempotentHint: false` is the honest signal. A
 * host that believed this tool idempotent would retry it and charge the user TWICE.
 */
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { reviewMarkdown } from '../format.js';
import {
  agentArg,
  prArg,
  ProjectedFinding,
  repoArg,
  RunStatusEnum,
  VerdictEnum,
} from '../schemas.js';
import type { ReviewService } from '../services/review.service.js';

/**
 * The service already normalizes everything it throws into a `ToolError` whose message
 * is written FOR THE MODEL (`errors.ts` — "errors lead onward"). Surface it verbatim;
 * never leak a stack trace into the context window.
 */
function errorText(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

export function registerRunAgentOnPrTool(server: McpServer, review: ReviewService): void {
  server.registerTool(
    'run_agent_on_pr',
    {
      title: 'Run a reviewer agent on a pull request',
      description:
        'Run a DevDigest reviewer agent on a pull request, wait for it to finish, and return the verdict and findings. This makes a paid model call — never call it twice for the same PR and agent. Get `agent` from list_agents.',
      // RAW ZOD SHAPE. Flat scalars only (P2).
      inputSchema: { repo: repoArg, pr: prArg, agent: agentArg },
      // Also a raw shape. Required: the handler emits `structuredContent`, and a host
      // cannot validate — or safely rely on — structured output whose shape nothing
      // declares. `status: 'running'` is the timeout path, not an error (§6).
      outputSchema: {
        status: RunStatusEnum,
        run_id: z.string(),
        agent: z.string(),
        verdict: VerdictEnum.nullable(),
        score: z.number().int().nullable(),
        summary: z.string().nullable(),
        findings: z.array(ProjectedFinding),
        total_findings: z.number().int(),
        cost_usd: z.number().nullable(),
        next: z.string().nullable(),
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: true,
      },
    },
    async ({ repo, pr, agent }) => {
      try {
        const result = await review.runOnPr({ repo, pr, agent });

        // `status: 'running'` is the TIMEOUT path, and it is returned with
        // `isError: false` ON PURPOSE (§6, the money rule). The model call is already
        // in flight and already billed; an error result invites the host to retry, and
        // a retry here starts a SECOND billable review. `result.next` carries the
        // "do NOT call run_agent_on_pr again — call get_findings with this run_id"
        // instruction. A failed/cancelled run produced nothing, so that IS an error.
        const isError = result.status === 'failed' || result.status === 'cancelled';

        return {
          isError,
          structuredContent: { ...result },
          // ONE concise markdown block — never JSON.stringify(structuredContent), which
          // would bill the same payload into the context twice for zero gain (§5.6).
          content: [
            {
              type: 'text' as const,
              text: result.status === 'done' ? reviewMarkdown(result) : (result.next ?? ''),
            },
          ],
        };
      } catch (err) {
        return { isError: true, content: [{ type: 'text' as const, text: errorText(err) }] };
      }
    },
  );
}
