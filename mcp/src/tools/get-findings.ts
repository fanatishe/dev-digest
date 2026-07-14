/**
 * TRANSPORT ring — `get_findings`.
 *
 * PLACEHOLDER (WP0): the registration is FINAL — name, title, description,
 * inputSchema and annotations are the LOCKED contract (plan §5.0/§5.3) and must not
 * be reworded. **WP2 owns this file** and replaces only the handler body with
 * `await review.getFindings({ repo, pr, runId: run_id, detail, limit })`.
 *
 * "Read-only — it never starts a review and costs nothing" is the DISAMBIGUATOR
 * against run_agent_on_pr: without the cost contrast, a model that only wants to READ
 * a review may reach for the tool that RUNS one.
 */
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { reviewMarkdown } from '../format.js';
import {
  detailArg,
  limitArg,
  prArg,
  ProjectedFinding,
  repoArg,
  runIdArg,
  VerdictEnum,
} from '../schemas.js';
import type { ReviewService } from '../services/review.service.js';

/** The service throws `ToolError`s already written for the model. Surface them verbatim. */
function errorText(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

export function registerGetFindingsTool(server: McpServer, review: ReviewService): void {
  server.registerTool(
    'get_findings',
    {
      title: 'Get the findings of a completed review',
      description:
        'Get the verdict and findings of a completed review on a pull request. Defaults to the latest completed review. Read-only — it never starts a review and costs nothing.',
      // RAW ZOD SHAPE. `detail` lives here and nowhere else: rationale/suggestion are
      // the only unbounded fields in the surface, so this is the one place the enum's
      // schema-token cost is earned.
      inputSchema: {
        repo: repoArg,
        pr: prArg,
        run_id: runIdArg.optional(),
        detail: detailArg.default('concise'),
        limit: limitArg.default(20),
      },
      // Also a raw shape. Required: the handler emits `structuredContent`, and a host
      // cannot validate — or safely rely on — structured output whose shape nothing
      // declares. `ProjectedFinding` covers BOTH detail levels (concise = the optional
      // fields absent), so one schema serves both without an `anyOf`.
      outputSchema: {
        run_id: z.string().nullable(),
        verdict: VerdictEnum.nullable(),
        score: z.number().int().nullable(),
        summary: z.string().nullable(),
        findings: z.array(ProjectedFinding),
        total_findings: z.number().int(),
        next: z.string().nullable(),
      },
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    async ({ repo, pr, run_id, detail, limit }) => {
      try {
        const result = await review.getFindings({ repo, pr, runId: run_id, detail, limit });
        return {
          structuredContent: { ...result },
          // ONE concise markdown block — never JSON.stringify of the same payload (§5.6).
          content: [{ type: 'text' as const, text: reviewMarkdown(result) }],
        };
      } catch (err) {
        return { isError: true, content: [{ type: 'text' as const, text: errorText(err) }] };
      }
    },
  );
}
