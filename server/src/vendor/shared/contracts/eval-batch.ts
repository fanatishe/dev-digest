import { z } from 'zod';
import { Severity, FindingCategory } from './findings.js';
import { EvalCase, EvalOwnerKind, EvalRun } from './knowledge.js';
import { EvalRunRecord, EvalRunResult } from './eval-ci.js';

/** One expected finding the scorer matches a produced finding against. */
export const EvalExpectedFinding = z.object({
  kind: z.enum(['must_find', 'must_not_flag']),
  file: z.string(),
  start_line: z.number().int(),
  end_line: z.number().int(),
  severity: Severity.nullish(),
  category: FindingCategory.nullish(),
  note: z.string().nullish(),
});
export type EvalExpectedFinding = z.infer<typeof EvalExpectedFinding>;

/** Stored in eval_cases.expected_output (was z.unknown()); written by the modal, read by the scorer. */
export const EvalExpectedOutput = z.object({
  expectations: z.array(EvalExpectedFinding),
});
export type EvalExpectedOutput = z.infer<typeof EvalExpectedOutput>;

/** Mirrors the NEW eval_batches row; one per run-all = one trend point. */
export const EvalBatch = z.object({
  id: z.string(),
  workspace_id: z.string(),
  owner_kind: EvalOwnerKind,
  owner_id: z.string(),
  agent_version: z.number().int().nullable(),
  ran_at: z.string(),
  recall: z.number(),
  precision: z.number(),
  citation_accuracy: z.number(),
  pass_rate: z.number(),
  traces_passed: z.number().int(),
  traces_total: z.number().int(),
  cases_total: z.number().int(),
  cost_usd: z.number().nullable(),
  duration_ms: z.number().int().nullable(),
});
export type EvalBatch = z.infer<typeof EvalBatch>;

/** Reproduction rate over the last N runs of the pinned version. Reliable iff ratio >= 0.8. */
export const EvalReproducibility = z.object({
  passed: z.number().int(),
  total: z.number().int(),
  ratio: z.number(),
  reliable: z.boolean(),
});
export type EvalReproducibility = z.infer<typeof EvalReproducibility>;

/** A case-list row: the case + its last run + repro summary, so rows render without N extra fetches. */
export const EvalCaseWithRuns = EvalCase.extend({
  last_run: EvalRunRecord.nullish(),
  repro: EvalReproducibility.nullish(),
});
export type EvalCaseWithRuns = z.infer<typeof EvalCaseWithRuns>;

/** Run-vs-run compare: two batches + deltas + each version's resolved system prompt. */
export const EvalCompare = z.object({
  base: EvalBatch,
  head: EvalBatch,
  delta: z.object({
    recall: z.number(),
    precision: z.number(),
    citation_accuracy: z.number(),
    pass_rate: z.number(),
  }),
  base_prompt: z.string(),
  head_prompt: z.string(),
});
export type EvalCompare = z.infer<typeof EvalCompare>;

/** Per-owner run-all result (one batch + the per-case runs). */
export const EvalRunAllResult = z.object({
  batch: EvalBatch,
  runs: z.array(EvalRunResult),
});
export type EvalRunAllResult = z.infer<typeof EvalRunAllResult>;

/** Whole-dashboard run-all result. */
export const EvalDashboardRunAllResult = z.object({
  batches: z.array(EvalBatch),
});
export type EvalDashboardRunAllResult = z.infer<typeof EvalDashboardRunAllResult>;

/** One agent row on the all-agents dashboard. */
export const EvalDashboardRow = z.object({
  owner_id: z.string(),
  name: z.string(),
  model: z.string().nullable(),
  agent_version: z.number().int().nullable(),
  cases_total: z.number().int(),
  last_batch: EvalBatch.nullish(),
  sparkline: z.array(z.number()),
});
export type EvalDashboardRow = z.infer<typeof EvalDashboardRow>;

/** The whole-workspace (agents-only) dashboard aggregate. */
export const EvalAgentDashboard = z.object({
  agents: z.array(EvalDashboardRow),
  recent_batches: z.array(EvalBatch),
});
export type EvalAgentDashboard = z.infer<typeof EvalAgentDashboard>;
