import type { CSSProperties } from "react";
import type { DiffRow } from "./diff";

export const s = {
  wrap: { padding: 28, maxWidth: 860 } satisfies CSSProperties,
  header: { display: "flex", alignItems: "center", gap: 12 } satisfies CSSProperties,
  h2: { fontSize: 16, fontWeight: 700 } satisfies CSSProperties,
  subtitle: { fontSize: 13, color: "var(--text-secondary)", margin: "4px 0 18px", lineHeight: 1.5 } satisfies CSSProperties,
  row: {
    display: "flex",
    alignItems: "center",
    gap: 14,
    padding: "12px 14px",
    border: "1px solid var(--border)",
    borderRadius: 8,
    background: "var(--bg-elevated)",
    marginBottom: 8,
  } satisfies CSSProperties,
  vBadge: {
    fontSize: 12,
    fontWeight: 700,
    color: "var(--accent)",
    background: "var(--accent-bg)",
    padding: "3px 8px",
    borderRadius: 6,
    flexShrink: 0,
  } satisfies CSSProperties,
  message: (muted: boolean): CSSProperties => ({
    fontSize: 13.5,
    fontWeight: 600,
    color: muted ? "var(--text-muted)" : "var(--text-primary)",
    fontStyle: muted ? "italic" : "normal",
  }),
  date: { fontSize: 12, color: "var(--text-muted)", marginTop: 2 } satisfies CSSProperties,
  diff: {
    margin: 0,
    fontSize: 12.5,
    lineHeight: 1.5,
    overflow: "auto",
    maxHeight: "60vh",
    borderRadius: 8,
    border: "1px solid var(--border)",
  } satisfies CSSProperties,
  diffRow: (type: DiffRow["type"]): CSSProperties => ({
    display: "flex",
    gap: 8,
    padding: "0 10px",
    whiteSpace: "pre-wrap",
    wordBreak: "break-word",
    background:
      type === "add" ? "rgba(46,160,67,0.15)" : type === "del" ? "rgba(248,81,73,0.15)" : "transparent",
    color: type === "ctx" ? "var(--text-secondary)" : "var(--text-primary)",
  }),
  diffGutter: { color: "var(--text-muted)", userSelect: "none", flexShrink: 0 } satisfies CSSProperties,
} as const;
