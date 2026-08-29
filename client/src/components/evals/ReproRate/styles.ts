import type { CSSProperties } from "react";

/** Colocated styles for the reproduction-rate badge + strip. */
export const s = {
  strip: (reliable: boolean): CSSProperties => ({
    display: "flex",
    alignItems: "center",
    gap: 10,
    padding: "8px 12px",
    borderRadius: 8,
    border: "1px solid var(--border)",
    background: reliable ? "var(--ok-bg, var(--bg-surface))" : "var(--bg-surface)",
  }),
  dots: { display: "inline-flex", gap: 4 } satisfies CSSProperties,
  dot: (pass: boolean | null): CSSProperties => ({
    width: 9,
    height: 9,
    borderRadius: 99,
    background:
      pass === true ? "var(--ok)" : pass === false ? "var(--crit)" : "var(--text-muted)",
  }),
  summary: {
    fontSize: 12.5,
    fontWeight: 600,
    color: "var(--text-secondary)",
  } satisfies CSSProperties,
  badgeWrap: { display: "inline-flex" } satisfies CSSProperties,
} as const;
