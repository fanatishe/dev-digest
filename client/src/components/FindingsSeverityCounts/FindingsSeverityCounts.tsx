"use client";

import React from "react";
import { useTranslations } from "next-intl";
import {
  SeverityBadge,
  FindingsPopover,
  SEV,
  type Severity,
  type PopoverFinding,
} from "@devdigest/ui";

/** Per-severity tallies, matching the shared `FindingsCounts` contract. */
export type SeverityCounts = { CRITICAL: number; WARNING: number; SUGGESTION: number };

/** Fixed display order — most severe first. Narrowed to the three counted keys. */
const SEVERITIES = ["CRITICAL", "WARNING", "SUGGESTION"] as const;

/**
 * Inline `CRITICAL · WARNING · SUGGESTION` finding counters, shared by the PR
 * list row and the agent-runs timeline. Hovering opens a {@link FindingsPopover}
 * listing the findings; clicking a single severity chip calls `onSelectSeverity`
 * to drill into just that level. Zero-count severities are dimmed (not hidden) so
 * column widths stay stable; when there are no findings at all we render a muted
 * dash, mirroring the SCORE column's unreviewed state.
 */
export function FindingsSeverityCounts({
  counts,
  preview,
  onSelectSeverity,
  onSelectFinding,
  align = "left",
}: {
  counts: SeverityCounts | null | undefined;
  preview: PopoverFinding[] | null | undefined;
  onSelectSeverity: (severity: Severity) => void;
  /** Click a specific finding in the popup (open it on the Agent-runs tab). */
  onSelectFinding?: (id: string) => void;
  align?: "left" | "right";
}) {
  const t = useTranslations("prReview");
  const c = counts ?? { CRITICAL: 0, WARNING: 0, SUGGESTION: 0 };
  const total = c.CRITICAL + c.WARNING + c.SUGGESTION;

  if (total === 0) {
    return <span style={{ color: "var(--text-muted)" }}>—</span>;
  }

  const chips = (
    <div style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
      {SEVERITIES.map((sev) => {
        const n = c[sev];
        const active = n > 0;
        return (
          <button
            key={sev}
            type="button"
            title={active ? t("counts.filterBy", { severity: SEV[sev].label }) : undefined}
            aria-label={active ? t("counts.filterBy", { severity: SEV[sev].label }) : undefined}
            disabled={!active}
            onClick={(e) => {
              e.stopPropagation();
              if (active) onSelectSeverity(sev);
            }}
            style={{
              background: "none",
              border: "none",
              padding: 0,
              cursor: active ? "pointer" : "default",
              opacity: active ? 1 : 0.35,
              display: "inline-flex",
            }}
          >
            <SeverityBadge severity={sev} count={n} compact />
          </button>
        );
      })}
    </div>
  );

  return (
    <FindingsPopover
      findings={preview ?? []}
      header={t("counts.header", { count: total })}
      confidenceLabel={t("counts.confidence")}
      align={align}
      onSelectFinding={onSelectFinding}
      findingLabel={(title) => t("counts.openFinding", { title })}
    >
      {chips}
    </FindingsPopover>
  );
}
