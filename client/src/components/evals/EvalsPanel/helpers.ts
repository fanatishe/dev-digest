/* EvalsPanel/helpers.ts — pure metric derivation for the panel's KPI cards.

   The panel is owner-agnostic (agent OR skill). A skill has no per-owner dashboard
   endpoint, so rather than a dashboard fetch the cards are DERIVED from the owner's
   cases' last runs — micro-averaged during render, never stored (react-best-practices,
   "derive don't store"). All inputs come typed from `@devdigest/shared`. */
import type { EvalCaseWithRuns, EvalRunRecord } from "@devdigest/shared";

export interface PanelMetrics {
  /** Micro-averaged over cases whose last run has a scored value; null when none. */
  recall: number | null;
  precision: number | null;
  citation: number | null;
  /** Cases whose last run passed / total cases (the "17/20 pass" headline). */
  tracesPassed: number;
  tracesTotal: number;
}

export function deriveMetrics(cases: readonly EvalCaseWithRuns[]): PanelMetrics {
  const lastRuns = cases
    .map((c) => c.last_run)
    .filter((r): r is EvalRunRecord => r != null);

  const mean = (values: number[]): number | null =>
    values.length ? values.reduce((a, b) => a + b, 0) / values.length : null;
  const collect = (pick: (r: EvalRunRecord) => number | null): number[] =>
    lastRuns.map(pick).filter((v): v is number => v != null);

  return {
    recall: mean(collect((r) => r.recall)),
    precision: mean(collect((r) => r.precision)),
    citation: mean(collect((r) => r.citation_accuracy)),
    tracesPassed: lastRuns.filter((r) => r.pass === true).length,
    tracesTotal: cases.length,
  };
}

/** Render a 0..1 ratio as a whole-percent string, or an em dash when absent. */
export function pct(value: number | null): string {
  return value == null ? "—" : `${Math.round(value * 100)}%`;
}
