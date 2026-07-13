import type React from "react";
import type { ScanStageStatus } from "@/lib/hooks/conventions";

const STAGE_COLOR: Record<ScanStageStatus, string> = {
  done: "var(--ok)",
  active: "var(--accent-text)",
  pending: "var(--text-muted)",
};

export const s = {
  panel: {
    display: "flex",
    flexDirection: "column",
    gap: 14,
    padding: 18,
    borderRadius: 12,
    background: "var(--bg-elevated)",
    border: "1px solid var(--border)",
    borderLeft: "3px solid var(--accent)",
  } as React.CSSProperties,
  header: { display: "flex", alignItems: "center", gap: 10 } as React.CSSProperties,
  pulse: {
    width: 8,
    height: 8,
    borderRadius: 99,
    background: "var(--accent)",
    animation: "ddpulse 1.4s ease-in-out infinite",
  } as React.CSSProperties,
  title: { fontSize: 14, fontWeight: 600, color: "var(--text-primary)" } as React.CSSProperties,
  elapsed: { fontSize: 12, color: "var(--text-muted)" } as React.CSSProperties,

  stages: { display: "flex", flexDirection: "column", gap: 8 } as React.CSSProperties,
  stage: (status: ScanStageStatus): React.CSSProperties => ({
    display: "flex",
    alignItems: "center",
    gap: 9,
    fontSize: 13,
    color: status === "pending" ? "var(--text-muted)" : "var(--text-primary)",
    opacity: status === "pending" ? 0.65 : 1,
    transition: "opacity .3s ease, color .3s ease",
  }),
  pendingDot: {
    display: "inline-block",
    width: 9,
    height: 9,
    margin: "0 2px",
    borderRadius: 99,
    border: "1.5px solid var(--text-muted)",
  } as React.CSSProperties,
  stageIcon: (status: ScanStageStatus): React.CSSProperties => ({
    display: "inline-flex",
    alignItems: "center",
    color: STAGE_COLOR[status],
    flexShrink: 0,
  }),

  log: {
    display: "flex",
    flexDirection: "column",
    gap: 3,
    padding: "10px 12px",
    borderRadius: 8,
    background: "var(--bg-surface)",
    border: "1px solid var(--border)",
    maxHeight: 132,
    overflowY: "auto",
  } as React.CSSProperties,
  line: (isError: boolean): React.CSSProperties => ({
    display: "flex",
    gap: 10,
    fontSize: 12,
    lineHeight: 1.6,
    color: isError ? "var(--crit)" : "var(--text-secondary)",
  }),
  lineTime: { color: "var(--text-muted)", flexShrink: 0 } as React.CSSProperties,
  error: { fontSize: 12.5, color: "var(--crit)" } as React.CSSProperties,
};
