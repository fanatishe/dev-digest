import type { CSSProperties } from "react";

const GRID =
  "24px 96px 52px minmax(84px,1.3fr) minmax(84px,1.3fr) minmax(84px,1.3fr) 60px 60px";

export const s = {
  toolbar: {
    display: "flex",
    alignItems: "center",
    justifyContent: "flex-end",
    gap: 12,
    marginBottom: 10,
  } satisfies CSSProperties,
  selectedCount: { fontSize: 12.5, color: "var(--text-muted)" } satisfies CSSProperties,
  headerRow: {
    display: "grid",
    gridTemplateColumns: GRID,
    alignItems: "center",
    gap: 10,
    padding: "0 12px 8px",
    fontSize: 11,
    fontWeight: 600,
    letterSpacing: "0.03em",
    color: "var(--text-muted)",
    borderBottom: "1px solid var(--border)",
  } satisfies CSSProperties,
  list: {
    listStyle: "none",
    margin: "8px 0 0",
    padding: 0,
    display: "flex",
    flexDirection: "column",
    gap: 6,
  } satisfies CSSProperties,
  row: {
    display: "grid",
    gridTemplateColumns: GRID,
    alignItems: "center",
    gap: 10,
    padding: "10px 12px",
    fontSize: 13,
    borderRadius: 6,
    // Full `border` shorthand in BOTH base and the selected variant, same
    // granularity — never mix a shorthand with a longhand override or React warns
    // and mis-styles on select/deselect (client INSIGHTS 2026-07-17).
    border: "1px solid var(--border)",
  } satisfies CSSProperties,
  rowSelected: {
    border: "1px solid var(--accent)",
    background: "var(--bg-hover)",
  } satisfies CSSProperties,
  versionBadge: {
    border: "1px solid var(--border)",
    color: "var(--text-secondary)",
    justifySelf: "start",
  } satisfies CSSProperties,
  when: { color: "var(--text-secondary)" } satisfies CSSProperties,
  num: {
    textAlign: "right",
    fontVariantNumeric: "tabular-nums",
    color: "var(--text-primary)",
  } satisfies CSSProperties,
  empty: {
    padding: "20px 12px",
    fontSize: 13,
    color: "var(--text-muted)",
    textAlign: "center",
  } satisfies CSSProperties,
  srOnly: {
    position: "absolute",
    width: 1,
    height: 1,
    padding: 0,
    margin: -1,
    overflow: "hidden",
    clip: "rect(0 0 0 0)",
    whiteSpace: "nowrap",
    border: 0,
  } satisfies CSSProperties,
} as const;
