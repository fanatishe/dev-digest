import type React from "react";

export const s = {
  body: { padding: 24, display: "flex", flexDirection: "column", gap: 16 } as React.CSSProperties,
  banner: {
    padding: "10px 14px",
    borderRadius: 8,
    background: "var(--accent-soft, rgba(80,120,255,0.12))",
    border: "1px solid var(--border)",
    fontSize: 13,
    color: "var(--text-secondary)",
  } as React.CSSProperties,
  row: { display: "flex", gap: 20, alignItems: "flex-start" } as React.CSSProperties,
  enabledLabel: {
    display: "flex",
    flexDirection: "column",
    gap: 6,
    fontSize: 13,
    color: "var(--text-secondary)",
  } as React.CSSProperties,
  enabledHint: { fontSize: 12, color: "var(--text-muted)" } as React.CSSProperties,
  editor: {
    borderRadius: 8,
    border: "1px solid var(--border)",
    overflow: "hidden",
    background: "var(--bg-surface)",
  } as React.CSSProperties,
  editorBar: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    padding: "6px 12px",
    borderBottom: "1px solid var(--border)",
  } as React.CSSProperties,
  fileName: { fontSize: 12, color: "var(--text-secondary)" } as React.CSSProperties,
  tokens: { fontSize: 12, color: "var(--text-muted)" } as React.CSSProperties,
  footer: { display: "flex", alignItems: "center", gap: 10 } as React.CSSProperties,
  savedNote: { fontSize: 12, color: "var(--text-muted)" } as React.CSSProperties,
};
