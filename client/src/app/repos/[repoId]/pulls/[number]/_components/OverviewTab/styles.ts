import type { CSSProperties } from "react";

export const s = {
  /** Intent (left) · Blast radius (right). Collapses on narrow viewports. */
  grid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(340px, 1fr))",
    gap: 20,
    alignItems: "start",
  } satisfies CSSProperties,
  placeholder: {
    fontSize: 13,
    color: "var(--text-muted)",
    lineHeight: 1.55,
  } satisfies CSSProperties,
  descriptionBox: {
    border: "1px solid var(--border)",
    borderRadius: 8,
    background: "var(--bg-elevated)",
    padding: 18,
    fontSize: 14,
    color: "var(--text-secondary)",
    whiteSpace: "pre-wrap",
    lineHeight: 1.55,
  } satisfies CSSProperties,
} as const;
