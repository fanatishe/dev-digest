import type React from "react";

export const s = {
  row: {
    display: "flex",
    alignItems: "center",
    gap: 14,
    padding: "12px 14px",
    background: "var(--bg-elevated)",
    border: "1px solid var(--border)",
    borderRadius: 8,
  },
  main: { display: "flex", alignItems: "center", gap: 10, minWidth: 0, flex: 1 },
  badges: { display: "flex", gap: 6, flexShrink: 0 },
  text: { display: "flex", flexDirection: "column", gap: 2, minWidth: 0 },
  name: {
    fontSize: 13.5,
    fontWeight: 600,
    color: "var(--text-primary)",
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  ref: { fontSize: 12, color: "var(--text-muted)", fontFamily: "var(--font-mono, monospace)" },
  meta: { fontSize: 11.5, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.03em" },
  right: { display: "flex", alignItems: "center", gap: 8, flexShrink: 0 },
} satisfies Record<string, React.CSSProperties>;
