import type { CSSProperties } from "react";

export const s = {
  wrap: {
    display: "inline-flex",
    alignItems: "center",
    gap: 4,
    padding: "3px 6px",
    borderRadius: 8,
    border: "1px solid var(--border)",
    background: "var(--bg-surface)",
  } satisfies CSSProperties,
  icon: { color: "var(--text-muted)", marginRight: 2 } satisfies CSSProperties,
  chip: {
    padding: "4px 10px",
    fontSize: 12.5,
    fontWeight: 500,
    borderRadius: 6,
    border: "1px solid transparent",
    background: "transparent",
    color: "var(--text-secondary)",
    cursor: "pointer",
    whiteSpace: "nowrap",
  } satisfies CSSProperties,
  chipActive: {
    background: "var(--bg-hover)",
    color: "var(--text-primary)",
    border: "1px solid var(--border-strong)",
  } satisfies CSSProperties,
} as const;
