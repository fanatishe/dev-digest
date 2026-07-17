/* Pure derivations for the Overview's findings-driven sections. Nothing here touches
   React or the network — RISK AREAS and REVIEW FOCUS are two lenses on the SAME data:
   the latest review's findings, already computed and diff-grounded by the reviewer. No
   model call is spent to show them (the feature is "almost free"). */
import type { FindingRecord, ReviewRecord } from "@devdigest/shared";

/** How many findings the "read these first" list surfaces. */
export const REVIEW_FOCUS_CAP = 5;

// Severity rank for ordering (higher = more urgent). Mirrors the server's SEV_RANK.
const SEV_RANK: Record<string, number> = { CRITICAL: 3, WARNING: 2, SUGGESTION: 1 };
function sevRank(severity: string): number {
  return SEV_RANK[severity] ?? 0;
}

/**
 * The latest review's NON-DISMISSED findings, ordered severity-desc then
 * confidence-desc — the deterministic source for RISK AREAS.
 *
 * Selection mirrors PrDetailView's diff-badge logic exactly: reviews come
 * newest-first, `kind:'summary'` rows carry no findings, and dismissed findings are
 * excluded (the Findings tab hides them, so surfacing one here would reveal nothing).
 */
export function orderedRiskFindings(reviews: ReviewRecord[] | undefined): FindingRecord[] {
  const findings = ((reviews ?? []).find((r) => r.kind === "review")?.findings ?? []).filter(
    (f) => f.dismissed_at == null,
  );
  // Stable sort over a copy — never mutate the query cache's array.
  return [...findings].sort(
    (a, b) => sevRank(b.severity) - sevRank(a.severity) || b.confidence - a.confidence,
  );
}

/** The top-N already-ordered findings for the REVIEW FOCUS "read these first" list. */
export function focusFindings(ordered: FindingRecord[]): FindingRecord[] {
  return ordered.slice(0, REVIEW_FOCUS_CAP);
}
