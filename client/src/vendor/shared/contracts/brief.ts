import { z } from 'zod';

/**
 * PR Brief building blocks: Intent, Blast radius, Risks, PR History,
 * Smart Diff. Composed into PrBrief.
 */

// ---- Intent ----
export const Intent = z.object({
  intent: z.string(),
  in_scope: z.array(z.string()),
  out_of_scope: z.array(z.string()),
  /**
   * Short chip labels for the areas this PR puts at risk (e.g. "Auth surface
   * touched"). Deliberately `string[]` and not the richer `Risk` — the intent
   * classifier never sees the hunk BODIES, so it cannot ground a `file_refs`
   * or a severity without inventing one.
   */
  risk_areas: z.array(z.string()).nullish(),
  /**
   * Which rungs of the source ladder actually fired, e.g. `["pr_body",
   * "issue #123"]` or, for a PR with no description at all, `["title",
   * "branch", "commits", "files"]`. Makes the degradation VISIBLE: the reader
   * can always tell whether the machine read a real spec or inferred the intent
   * from a branch name.
   */
  derived_from: z.array(z.string()).nullish(),
});
export type Intent = z.infer<typeof Intent>;

// ---- Blast radius ----
export const ChangedSymbol = z.object({
  name: z.string(),
  file: z.string(),
  kind: z.string(),
});
export type ChangedSymbol = z.infer<typeof ChangedSymbol>;

export const BlastCaller = z.object({
  name: z.string(),
  file: z.string(),
  line: z.number().int(),
});
export type BlastCaller = z.infer<typeof BlastCaller>;

export const DownstreamImpact = z.object({
  symbol: z.string(),
  callers: z.array(BlastCaller),
  endpoints_affected: z.array(z.string()),
  crons_affected: z.array(z.string()),
});
export type DownstreamImpact = z.infer<typeof DownstreamImpact>;

export const BlastRadius = z.object({
  changed_symbols: z.array(ChangedSymbol),
  downstream: z.array(DownstreamImpact),
  summary: z.string(),
  /**
   * Index health, surfaced so the panel can badge a partial answer instead of
   * rendering an empty card that looks like "nothing is affected".
   *
   * This has to live IN the contract: `fastify-type-provider-zod` serializes the
   * response through this schema and silently drops any key it does not declare,
   * so a degraded flag bolted on beside it would never reach the client.
   */
  degraded: z.boolean().nullish(),
  /** Why it is degraded — `no_data` | `flag_off` | `index_partial` | … */
  reason: z.string().nullish(),
  /**
   * A background clone/index resync was kicked off because this repo has PR activity
   * newer than the last index (see `pulls/freshness.ts`). The data served is still
   * VALID — this only signals a fresher version is on its way, so the client can badge
   * "Updating…" and refetch shortly. Distinct from `degraded`, which means the answer
   * itself is incomplete. Must live in the contract, or the zod serializer strips it.
   */
  refreshing: z.boolean().nullish(),
});
export type BlastRadius = z.infer<typeof BlastRadius>;

// ---- Risks ----
export const RiskSeverity = z.enum(['high', 'medium', 'low']);
export type RiskSeverity = z.infer<typeof RiskSeverity>;

export const Risk = z.object({
  kind: z.string(),
  title: z.string(),
  explanation: z.string(),
  severity: RiskSeverity,
  file_refs: z.array(z.string()),
});
export type Risk = z.infer<typeof Risk>;

export const Risks = z.object({
  risks: z.array(Risk),
});
export type Risks = z.infer<typeof Risks>;

// ---- PR History ----
export const PrHistoryItem = z.object({
  pr_number: z.number().int(),
  title: z.string(),
  merged_at: z.string(),
  author: z.string(),
  files_overlap: z.array(z.string()),
  notes: z.string(),
  /**
   * The merge/squash commit the entry was recovered from. This is the only
   * NAMESPACE-FREE identifier we have: on a FORK, `pr_number` refers to the repo the
   * merge happened in (usually upstream), whose numbering restarts on the fork — so a
   * `/pull/N` link built from it can open an unrelated PR. A commit link never can.
   */
  merge_sha: z.string().nullish(),
  /**
   * True only when `pr_number` was corroborated as THIS repo's own numbering — the
   * number exists among the repo's imported PRs AND its branch/title matches what the
   * merge commit records. The client renders a `/pull/N` link only then; otherwise it
   * links the commit. Never trust a bare number from git log: on a fork it is
   * upstream's.
   */
  number_confirmed: z.boolean().nullish(),
});
export type PrHistoryItem = z.infer<typeof PrHistoryItem>;

export const PrHistory = z.object({
  history: z.array(PrHistoryItem),
  /** See `BlastRadius.refreshing` — a background clone resync is in flight because the
   *  repo has PR activity newer than the last index; the served history is still valid. */
  refreshing: z.boolean().nullish(),
});
export type PrHistory = z.infer<typeof PrHistory>;

// ---- Smart Diff ----
export const SmartDiffRole = z.enum(['core', 'wiring', 'boilerplate']);
export type SmartDiffRole = z.infer<typeof SmartDiffRole>;

export const SmartDiffFile = z.object({
  path: z.string(),
  pseudocode_summary: z.string().nullish(),
  additions: z.number().int(),
  deletions: z.number().int(),
  finding_lines: z.array(z.number().int()),
});
export type SmartDiffFile = z.infer<typeof SmartDiffFile>;

export const SmartDiffGroup = z.object({
  role: SmartDiffRole,
  files: z.array(SmartDiffFile),
});
export type SmartDiffGroup = z.infer<typeof SmartDiffGroup>;

export const ProposedSplit = z.object({
  name: z.string(),
  files: z.array(z.string()),
});
export type ProposedSplit = z.infer<typeof ProposedSplit>;

export const SmartDiff = z.object({
  groups: z.array(SmartDiffGroup),
  split_suggestion: z.object({
    too_big: z.boolean(),
    total_lines: z.number().int(),
    proposed_splits: z.array(ProposedSplit),
  }),
});
export type SmartDiff = z.infer<typeof SmartDiff>;

// ---- Composed PR Brief (pr_brief.json) ----
export const PrBrief = z.object({
  intent: Intent,
  blast: BlastRadius,
  risks: Risks,
  history: PrHistory,
});
export type PrBrief = z.infer<typeof PrBrief>;
