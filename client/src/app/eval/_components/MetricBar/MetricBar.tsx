/* MetricBar — a compact colored progress bar with a trailing % label, sized to sit
   inside a table cell or a dashboard row. Shared by the per-agent RecentRunsTable
   and the all-agents dashboard recent-runs rows so a metric reads the same on both.
   Modeled on the @devdigest/ui BarRow fill, but cell-sized (no fixed label column). */
"use client";

import React from "react";
import { pct } from "../../helpers";

export function MetricBar({
  value,
  color,
  title,
}: {
  /** 0..1 metric value. */
  value: number;
  /** Bar fill color (a CSS var from METRICS). */
  color: string;
  /** Optional accessible/title text (e.g. "Recall 82%"). */
  title?: string;
}) {
  const clamped = Math.max(0, Math.min(1, value));
  return (
    <span
      style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}
      title={title}
    >
      <span
        aria-hidden
        style={{
          flex: 1,
          height: 6,
          minWidth: 24,
          background: "var(--bg-hover)",
          borderRadius: 3,
          overflow: "hidden",
        }}
      >
        <span
          style={{
            display: "block",
            width: `${clamped * 100}%`,
            height: "100%",
            background: color,
            borderRadius: 3,
          }}
        />
      </span>
      <span
        className="tnum"
        style={{
          fontSize: 12,
          color: "var(--text-secondary)",
          fontVariantNumeric: "tabular-nums",
          minWidth: 34,
          textAlign: "right",
        }}
      >
        {pct(value)}
      </span>
    </span>
  );
}

export default MetricBar;
