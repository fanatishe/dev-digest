/**
 * DOMAIN ring — pure. Zod shapes only: no fetch, no env, no fs, no MCP SDK.
 *
 * Two kinds of shape live here:
 *  1. The shared ARGUMENT fragments the tools compose their `inputSchema` from.
 *     Every argument is a scalar (P2 — flat arguments): models, especially
 *     non-Anthropic ones, make more mistakes on nested objects.
 *  2. The RESPONSE projections (§5.6). A raw `FindingRecord` / `Agent` on the wire is
 *     the single biggest token sink in this surface, so nothing raw ever leaves.
 *
 * NOTE: an `inputSchema` is a RAW ZOD SHAPE (`{ repo: repoArg }`), never
 * `z.object({...})`. Wrapping it produces a broken JSON Schema that fails at CALL
 * time, not at registration — the classic SDK-v1 bug.
 */
import { z } from 'zod';

// ---- Shared argument fragments -------------------------------------------------
// The descriptions ride in the JSON Schema and load at chat start, like the tool
// descriptions themselves. The "or a uuid" clause is what makes "accept both"
// legible instead of a guessing game; the examples cost less than a failed call.

export const repoArg = z
  .string()
  .min(1)
  .describe('Repository as "owner/name" (e.g. "acme/payments-api") or a repo uuid.');

export const prArg = z
  .union([z.number().int().positive(), z.string().min(1)])
  .describe('Pull request number (e.g. 482) or a PR uuid.');

export const agentArg = z
  .string()
  .min(1)
  .describe('Agent id from list_agents. An agent name also works (case-insensitive).');

export const runIdArg = z
  .string()
  .uuid()
  .describe('A specific run (from run_agent_on_pr). Omit for the latest completed review.');

export const detailArg = z
  .enum(['concise', 'full'])
  .describe('concise = severity/title/file/line. full = adds rationale and suggestion.');

export const limitArg = z.number().int().min(1).max(50);

// ---- Response projections (§5.6) ------------------------------------------------

/**
 * Dropped from `FindingRecord`: `id`, `review_id`, `accepted_at`, `dismissed_at`,
 * `kind`, `trifecta_components`, `evidence` — and `start_line`/`end_line`, folded
 * into a single `lines` string ("42" or "42-58").
 */
export const ConciseFinding = z.object({
  severity: z.enum(['CRITICAL', 'WARNING', 'SUGGESTION']),
  category: z.string(),
  title: z.string(),
  file: z.string(),
  lines: z.string(),
});
export type ConciseFinding = z.infer<typeof ConciseFinding>;

/** `rationale` / `suggestion` are unbounded markdown — the reason `detail` exists. */
export const FullFinding = ConciseFinding.extend({
  confidence: z.number(),
  rationale: z.string(),
  suggestion: z.string().nullable(),
});
export type FullFinding = z.infer<typeof FullFinding>;

/**
 * What a findings-bearing tool actually emits: a `ConciseFinding`, or a `FullFinding`
 * when `detail: 'full'`. Declared as concise-plus-optionals rather than
 * `z.union([ConciseFinding, FullFinding])` on purpose — a union renders as `anyOf` in
 * the JSON Schema, which is both bigger in the host's context (schema tokens are rent,
 * §5.0) and harder for a model to read than one object with three optional fields.
 */
export const ProjectedFinding = ConciseFinding.extend({
  confidence: z.number().optional(),
  rationale: z.string().optional(),
  suggestion: z.string().nullable().optional(),
});
export type ProjectedFinding = z.infer<typeof ProjectedFinding>;

/** The reviewer's call on a PR. */
export const VerdictEnum = z.enum(['request_changes', 'approve', 'comment']);

/**
 * Terminal state of a run, as reported to the model. `running` is the TIMEOUT path of
 * `run_agent_on_pr` — deliberately NOT an error (§6, the money rule).
 */
export const RunStatusEnum = z.enum(['done', 'failed', 'cancelled', 'running']);

/**
 * `Agent` minus `system_prompt` (multi-KB — the biggest response-bloat source in the
 * whole surface), `output_schema`, `version`, `strategy`, `ci_fail_on`, `repo_intel`
 * and `provider`.
 */
export const AgentSummary = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),
  model: z.string(),
  enabled: z.boolean(),
});
export type AgentSummary = z.infer<typeof AgentSummary>;

/** `ConventionCandidate` minus `id` and `evidence_sha`; snippet truncated (see format.ts). */
export const ConventionSummary = z.object({
  rule: z.string(),
  evidence_path: z.string(),
  evidence_snippet: z.string(),
  confidence: z.number(),
  accepted: z.boolean(),
});
export type ConventionSummary = z.infer<typeof ConventionSummary>;

// ---- Blast radius (§5.5) --------------------------------------------------------

/** A symbol the PR changes. */
export const BlastSymbolSummary = z.object({
  name: z.string(),
  file: z.string(),
  kind: z.string(),
});
export type BlastSymbolSummary = z.infer<typeof BlastSymbolSummary>;

/**
 * `BlastCaller` folded to `"file:line"` — a caller is only ever USED as a place to
 * go look, and `{name, file, line}` costs three keys per row to say what one string
 * says. With callers capped at a few dozen, that difference is most of this
 * response's token budget.
 */
export const BlastCallerSummary = z.object({
  name: z.string(),
  at: z.string().describe('file:line — where the call site is.'),
});
export type BlastCallerSummary = z.infer<typeof BlastCallerSummary>;

/** One changed symbol and what it puts at risk. */
export const BlastImpactSummary = z.object({
  symbol: z.string(),
  callers: z.array(BlastCallerSummary),
  total_callers: z.number().int().describe('Before the cap — so a truncation is visible.'),
  endpoints_affected: z.array(z.string()),
  crons_affected: z.array(z.string()),
});
export type BlastImpactSummary = z.infer<typeof BlastImpactSummary>;
