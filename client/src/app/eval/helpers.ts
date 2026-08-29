/* app/eval/helpers.ts — route-level pure helpers shared by the eval dashboard,
   detail, table and compare components. No I/O, no React. */

import type { EvalBatch } from "@devdigest/shared";

/** A 0..1 metric as a whole-percent string (e.g. 0.833 → "83%"). */
export function pct(n: number | null | undefined): string {
  if (n == null || Number.isNaN(n)) return "—";
  return `${Math.round(n * 100)}%`;
}

/** A signed 0..1 delta as percentage points (e.g. +0.12 → "+12 pts", 0 → "±0 pts"). */
export function deltaPts(n: number | null | undefined): string {
  if (n == null || Number.isNaN(n)) return "";
  const p = Math.round(n * 100);
  const sign = p > 0 ? "+" : p < 0 ? "−" : "±";
  return `${sign}${Math.abs(p)} pts`;
}

/** "17/20 pass" style summary for a batch (guards a zero-total batch). */
export function passSummary(batch: EvalBatch | null | undefined): string {
  if (!batch) return "no runs";
  return `${batch.traces_passed}/${batch.traces_total} pass`;
}

/** A batch's short version label ("v6", or "unpinned" when null). */
export function versionLabel(version: number | null | undefined): string {
  return version == null ? "unpinned" : `v${version}`;
}

/** Format an ISO instant as a short local date-time for run/batch rows. */
export function shortWhen(iso: string): string {
  const ms = Date.parse(iso);
  if (Number.isNaN(ms)) return iso;
  return new Date(ms).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}
