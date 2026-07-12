import type React from "react";

/** Confidence → color, matching ConfidenceNum's thresholds. */
export function confidenceColor(pct: number): string {
  return pct >= 85 ? "var(--ok)" : pct >= 65 ? "var(--warn)" : "var(--text-muted)";
}

export const s = {
  card: (accepted: boolean): React.CSSProperties => ({
    display: "flex",
    gap: 16,
    alignItems: "flex-start",
    padding: 18,
    borderRadius: 12,
    background: "var(--bg-elevated)",
    border: "1px solid var(--border)",
    borderLeft: `3px solid ${accepted ? "var(--ok)" : "var(--warn)"}`,
  }),
  main: { flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 12 } as React.CSSProperties,
  /** Rule text + its edit affordance; the text itself is the click target. */
  ruleRow: { display: "flex", alignItems: "flex-start", gap: 8 } as React.CSSProperties,
  rule: {
    flex: 1,
    minWidth: 0,
    fontSize: 15,
    fontWeight: 600,
    fontStyle: "italic",
    color: "var(--text-primary)",
    cursor: "text",
    borderRadius: 6,
    // Matches the textarea's padding so the text doesn't shift when edit mode opens.
    padding: "2px 4px",
    margin: "-2px -4px",
  } as React.CSSProperties,
  editWrap: { display: "flex", flexDirection: "column", gap: 8 } as React.CSSProperties,
  editActions: { display: "flex", alignItems: "center", gap: 8 } as React.CSSProperties,
  evidence: {
    borderRadius: 8,
    border: "1px solid var(--border)",
    background: "var(--bg-surface)",
    overflow: "hidden",
  } as React.CSSProperties,
  evidenceBar: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    padding: "6px 8px 6px 12px",
    borderBottom: "1px solid var(--border)",
  } as React.CSSProperties,
  evidencePath: { fontSize: 12, color: "var(--text-secondary)" } as React.CSSProperties,
  snippet: {
    margin: 0,
    padding: "12px 14px",
    fontSize: 12.5,
    lineHeight: 1.5,
    color: "var(--text-primary)",
    overflowX: "auto",
    whiteSpace: "pre",
  } as React.CSSProperties,
  confidenceRow: { display: "flex", alignItems: "center", gap: 10 } as React.CSSProperties,
  confidenceLabel: { fontSize: 12, color: "var(--text-muted)" } as React.CSSProperties,
  track: {
    position: "relative",
    width: 120,
    height: 5,
    borderRadius: 99,
    background: "var(--bg-inset, rgba(255,255,255,0.08))",
    overflow: "hidden",
  } as React.CSSProperties,
  fill: (pct: number, color: string): React.CSSProperties => ({
    position: "absolute",
    inset: 0,
    width: `${pct}%`,
    background: color,
    borderRadius: 99,
  }),
  actions: { display: "flex", flexDirection: "column", gap: 8, flexShrink: 0 } as React.CSSProperties,
};
