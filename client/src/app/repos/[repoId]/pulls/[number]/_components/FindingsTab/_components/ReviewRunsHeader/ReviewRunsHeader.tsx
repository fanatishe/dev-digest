"use client";

import { SectionLabel, Icon, SEV } from "@devdigest/ui";
import type { Severity } from "@devdigest/ui";

/** "Review runs" section header. Shows the active severity filter as a
 *  clearable chip, or a hint when no filter is set. */
export function ReviewRunsHeader({
  severity,
  onClearSeverity,
}: {
  severity?: Severity | null;
  onClearSeverity?: () => void;
}) {
  return (
    <SectionLabel
      icon="AlertOctagon"
      right={
        severity ? (
          <button
            type="button"
            onClick={onClearSeverity}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              background: "none",
              border: "1px solid var(--border)",
              borderRadius: 6,
              padding: "2px 8px",
              fontSize: 12,
              color: SEV[severity]?.c ?? "var(--text-secondary)",
              cursor: "pointer",
            }}
          >
            {SEV[severity]?.label ?? severity} only
            <Icon.X size={12} />
          </button>
        ) : (
          <span style={{ fontSize: 12, color: "var(--text-muted)" }}>grouped by run · newest first</span>
        )
      }
    >
      Review runs
    </SectionLabel>
  );
}
