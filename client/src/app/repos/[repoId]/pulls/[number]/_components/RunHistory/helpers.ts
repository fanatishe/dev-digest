import type { ReviewRecord } from "@devdigest/shared";
import type { PopoverFinding } from "@devdigest/ui";
import type { SeverityCounts } from "@/components/FindingsSeverityCounts";

/** Most-severe-first rank for ordering the popover preview. */
const SEV_RANK: Record<string, number> = { CRITICAL: 0, WARNING: 1, SUGGESTION: 2 };
const PREVIEW_CAP = 6;

export type RunFindings = { counts: SeverityCounts; preview: PopoverFinding[] };

/**
 * Group a PR's review findings by their originating run so the agent-runs
 * timeline can show a per-severity breakdown + hover preview without any extra
 * fetch — the reviews payload already carries every finding. Dismissed findings
 * are excluded (they're hidden everywhere else too), and runs with no live
 * findings are omitted so the timeline falls back to its plain count text.
 */
export function findingsByRun(reviews: ReviewRecord[]): Map<string, RunFindings> {
  const map = new Map<string, RunFindings>();
  for (const rv of reviews) {
    if (!rv.run_id) continue;
    const live = rv.findings.filter((f) => !f.dismissed_at);
    if (live.length === 0) continue;

    const counts: SeverityCounts = { CRITICAL: 0, WARNING: 0, SUGGESTION: 0 };
    for (const f of live) {
      if (f.severity === "CRITICAL" || f.severity === "WARNING" || f.severity === "SUGGESTION") {
        counts[f.severity] += 1;
      }
    }
    const preview: PopoverFinding[] = [...live]
      .sort(
        (a, b) =>
          (SEV_RANK[a.severity] ?? 9) - (SEV_RANK[b.severity] ?? 9) || b.confidence - a.confidence,
      )
      .slice(0, PREVIEW_CAP)
      .map((f) => ({
        id: f.id,
        severity: f.severity,
        title: f.title,
        file: f.file,
        start_line: f.start_line,
        confidence: f.confidence,
        rationale: f.rationale,
      }));

    // Defensive: a run_id could surface on more than one review row — merge.
    const existing = map.get(rv.run_id);
    if (existing) {
      existing.counts.CRITICAL += counts.CRITICAL;
      existing.counts.WARNING += counts.WARNING;
      existing.counts.SUGGESTION += counts.SUGGESTION;
      existing.preview = [...existing.preview, ...preview].slice(0, PREVIEW_CAP);
    } else {
      map.set(rv.run_id, { counts, preview });
    }
  }
  return map;
}
