/* AgentEvalDetailView/helpers.ts — pure batch ordering + metric accessors. */

import type { EvalBatch } from "@devdigest/shared";
import type { MetricKey } from "../../constants";

/** Chronological (oldest → newest) for the trend chart. Non-mutating. */
export function byRanAtAsc(batches: EvalBatch[]): EvalBatch[] {
  return [...batches].sort((a, b) => Date.parse(a.ran_at) - Date.parse(b.ran_at));
}

/** Newest → oldest for the runs table. Non-mutating. */
export function byRanAtDesc(batches: EvalBatch[]): EvalBatch[] {
  return [...batches].sort((a, b) => Date.parse(b.ran_at) - Date.parse(a.ran_at));
}

/** Read a metric off the dashboard `current` block by display key. */
export function currentMetric(
  current: { recall: number; precision: number; citation_accuracy: number },
  key: MetricKey,
): number {
  return key === "recall"
    ? current.recall
    : key === "precision"
      ? current.precision
      : current.citation_accuracy;
}

/** Read a metric off the dashboard `delta` block by display key. */
export function deltaMetric(
  delta: { recall: number; precision: number; citation_accuracy: number },
  key: MetricKey,
): number {
  return key === "recall" ? delta.recall : key === "precision" ? delta.precision : delta.citation_accuracy;
}
