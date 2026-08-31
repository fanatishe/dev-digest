import type { CSSProperties } from "react";

export const s = {
  body: { padding: "18px 24px", display: "flex", flexDirection: "column", gap: 16 } satisfies CSSProperties,
  versions: { fontSize: 13, fontWeight: 600, color: "var(--text-secondary)" } satisfies CSSProperties,
  cards: {
    display: "grid",
    gridTemplateColumns: "repeat(4, 1fr)",
    gap: 12,
  } satisfies CSSProperties,
  card: {
    display: "flex",
    flexDirection: "column",
    gap: 4,
    padding: 14,
    borderRadius: 9,
    border: "1px solid var(--border)",
    background: "var(--bg-elevated)",
  } satisfies CSSProperties,
  cardLabel: {
    fontSize: 11,
    fontWeight: 600,
    letterSpacing: "0.03em",
    color: "var(--text-muted)",
    textTransform: "uppercase",
  } satisfies CSSProperties,
  cardValue: {
    fontSize: 24,
    fontWeight: 700,
    letterSpacing: "-0.02em",
    fontVariantNumeric: "tabular-nums",
  } satisfies CSSProperties,
  cardDelta: { fontSize: 12.5, fontWeight: 600 } satisfies CSSProperties,
  notice: { padding: "18px 4px", fontSize: 13, color: "var(--text-muted)" } satisfies CSSProperties,
  footer: {
    display: "flex",
    alignItems: "center",
    justifyContent: "flex-end",
    gap: 10,
  } satisfies CSSProperties,
  promoteError: { flex: 1, fontSize: 12.5, color: "var(--crit)" } satisfies CSSProperties,
} as const;
