import { z } from 'zod';

/**
 * Run trace. The ENTIRE trace of one run is persisted as a SINGLE
 * jsonb document in `run_traces` (not per-row). Live events stream via SSE
 * during the run; the full log is written once on completion.
 */

export const RunEventKind = z.enum(['info', 'tool', 'result', 'error']);
export type RunEventKind = z.infer<typeof RunEventKind>;

/** A single live-log line. `t` = elapsed timestamp string (e.g. "00.31"). */
export const RunLogLine = z.object({
  t: z.string(),
  kind: RunEventKind,
  msg: z.string(),
});
export type RunLogLine = z.infer<typeof RunLogLine>;

/** SSE payload streamed on `/runs/:id/events`. */
export const RunEvent = z.object({
  runId: z.string(),
  seq: z.number().int(),
  kind: RunEventKind,
  msg: z.string(),
  t: z.string(),
  data: z.unknown().optional(),
});
export type RunEvent = z.infer<typeof RunEvent>;

export const ToolCall = z.object({
  tool: z.string(),
  args: z.string(),
  meta: z.string().nullish(),
  ms: z.number().int(),
});
export type ToolCall = z.infer<typeof ToolCall>;

export const PromptAssembly = z.object({
  system: z.string(),
  skills: z.string().nullish(),
  memory: z.string().nullish(),
  specs: z.string().nullish(),
  /** Callers-of-changed-symbols digest (repo-intel); null when absent. */
  callers: z.string().nullish(),
  /** Repo skeleton / map (repo-intel); null when absent. */
  repo_map: z.string().nullish(),
  /** PR author's description/body (truncated); null when absent. */
  pr_description: z.string().nullish(),
  /** The derived PR intent/scope block injected into the prompt; null when the
      PR has no computed intent (a review never computes one silently). */
  intent: z.string().nullish(),
  user: z.string(),
});
export type PromptAssembly = z.infer<typeof PromptAssembly>;

export const MemoryPulled = z.object({
  pr: z.number().int().nullish(),
  text: z.string(),
});
export type MemoryPulled = z.infer<typeof MemoryPulled>;

export const RunStats = z.object({
  duration_ms: z.number().int(),
  tokens_in: z.number().int(),
  tokens_out: z.number().int(),
  findings: z.number().int(),
  grounding: z.string(),
  /** Generation cost in USD; null when no usage was reported. */
  cost_usd: z.number().nullable(),
  /** Tokens added by the injected skills prompt block; 0 when the agent has no
      enabled+linked skills. Nullish so traces written before skills validate. */
  skills_tokens: z.number().int().nullish(),
  /** Tokens added by the injected Project-context (specs) prompt block; 0 when no
      docs were injected. Nullish so traces written before this feature still validate. */
  specs_tokens: z.number().int().nullish(),
});
export type RunStats = z.infer<typeof RunStats>;

/**
 * Per-skill snapshot captured at injection time — the EXACT skill (name, version,
 * type, body) that was attached to this run's prompt, in link order. Powers the run
 * trace's "Skill Dynamics" panel, which shows the precise body each skill contributed
 * (distinct from `prompt_assembly.skills`, which is the merged rendered block).
 * Nullish/additive so traces written before skill snapshots still validate.
 */
export const TraceSkill = z.object({
  id: z.string(),
  name: z.string(),
  version: z.number().int(),
  type: z.string(),
  body: z.string(),
});
export type TraceSkill = z.infer<typeof TraceSkill>;

/**
 * A repo document that was attached to an agent/skill but NOT injected into this
 * run's prompt, paired with the reason it was dropped. Powers the run trace's
 * Project-context audit (whole-doc drop only — never head-truncation).
 */
export const SkippedDoc = z.object({
  path: z.string(),
  reason: z.enum(['not_found', 'unsafe', 'over_budget']),
});
export type SkippedDoc = z.infer<typeof SkippedDoc>;

/** The single-document trace stored in `run_traces.trace`. */
export const RunTrace = z.object({
  config: z.object({
    agent: z.string(),
    version: z.string().nullish(),
    provider: z.string().nullish(),
    model: z.string(),
    pr: z.number().int().nullish(),
    source: z.enum(['local', 'ci']).default('local'),
    /** The skills attached to this run, snapshotted at injection time. Absent on
        runs with no enabled+linked skills, and on traces written before this field. */
    skills: z.array(TraceSkill).nullish(),
  }),
  stats: RunStats,
  prompt_assembly: PromptAssembly,
  tool_calls: z.array(ToolCall),
  raw_output: z.string(),
  memory_pulled: z.array(MemoryPulled),
  specs_read: z.array(z.string()),
  /** Attached docs dropped before injection (not_found | unsafe | over_budget),
      in encounter order. Absent when nothing was skipped and on pre-feature traces. */
  specs_skipped: z.array(SkippedDoc).nullish(),
  log: z.array(RunLogLine),
});
export type RunTrace = z.infer<typeof RunTrace>;

/**
 * One row of a PR's run history (every agent_runs row, any status). Surfaced on
 * the PR page so runs — including FAILED ones with their error — survive reload.
 */
export const RunSummary = z.object({
  run_id: z.string(),
  agent_id: z.string().nullable(),
  agent_name: z.string().nullable(),
  provider: z.string().nullable(),
  model: z.string().nullable(),
  status: z.string().nullable(), // running | done | failed | cancelled
  error: z.string().nullable(),
  duration_ms: z.number().int().nullable(),
  tokens_in: z.number().int().nullable(),
  tokens_out: z.number().int().nullable(),
  /** Generation cost in USD; null when no usage was reported. */
  cost_usd: z.number().nullable(),
  findings_count: z.number().int().nullable(),
  grounding: z.string().nullable(),
  ran_at: z.string().nullable(),
  // Review outcome, denormalized onto the run row at completion (the timeline
  // has no FK to the review). score = the review's 0-100 score; blockers =
  // findings that trip the agent's gate. Null on failed/cancelled runs.
  score: z.number().int().nullable(),
  blockers: z.number().int().nullable(),
});
export type RunSummary = z.infer<typeof RunSummary>;
