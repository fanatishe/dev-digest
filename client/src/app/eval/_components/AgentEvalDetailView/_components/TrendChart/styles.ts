import type { CSSProperties } from "react";

export const s = {
  legend: { display: "flex", gap: 18, marginBottom: 8 } satisfies CSSProperties,
  legendItem: {
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    fontSize: 12,
    color: "var(--text-secondary)",
  } satisfies CSSProperties,
  legendDot: { width: 10, height: 3, borderRadius: 2 } satisfies CSSProperties,
  fallback: { display: "flex", flexDirection: "column", gap: 10, padding: "8px 0" } satisfies CSSProperties,
  fallbackRow: { display: "flex", alignItems: "center", gap: 14 } satisfies CSSProperties,
  fallbackLabel: {
    width: 80,
    fontSize: 12,
    fontWeight: 600,
    color: "var(--text-secondary)",
  } satisfies CSSProperties,
} as const;
