import type { CSSProperties } from "react";

export const s = {
  panel: {
    border: "1px solid var(--border)",
    borderRadius: 9,
    background: "var(--bg-surface)",
    overflow: "hidden",
  } satisfies CSSProperties,
  header: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    padding: "10px 14px",
    borderBottom: "1px solid var(--border)",
    fontSize: 12,
    fontWeight: 600,
    color: "var(--text-secondary)",
  } satisfies CSSProperties,
  legend: { display: "inline-flex", gap: 12, fontSize: 11.5 } satisfies CSSProperties,
  legendDel: { color: "var(--crit)" } satisfies CSSProperties,
  legendAdd: { color: "var(--ok)" } satisfies CSSProperties,
  unavailable: {
    padding: "18px 14px",
    fontSize: 13,
    color: "var(--text-muted)",
  } satisfies CSSProperties,
  diff: {
    margin: 0,
    padding: "8px 0",
    maxHeight: 320,
    overflow: "auto",
    fontSize: 12.5,
    lineHeight: 1.5,
    fontFamily: "var(--font-mono, ui-monospace, monospace)",
  } satisfies CSSProperties,
  line: {
    display: "flex",
    gap: 8,
    padding: "0 14px",
    whiteSpace: "pre-wrap",
    wordBreak: "break-word",
  } satisfies CSSProperties,
  sign: { width: 10, flex: "0 0 auto", color: "var(--text-muted)" } satisfies CSSProperties,
  ctx: { color: "var(--text-secondary)" } satisfies CSSProperties,
  add: { color: "var(--ok)", background: "var(--ok-bg, transparent)" } satisfies CSSProperties,
  del: { color: "var(--crit)", background: "var(--crit-bg, transparent)" } satisfies CSSProperties,
} as const;
