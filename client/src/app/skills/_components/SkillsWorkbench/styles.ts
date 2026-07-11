import type { CSSProperties } from "react";

/** Co-located styles for the Skills workbench (left list + right detail). */
export const s = {
  shell: { display: "flex", height: "calc(100vh - 52px)" } satisfies CSSProperties,
  left: {
    width: 320,
    flexShrink: 0,
    borderRight: "1px solid var(--border)",
    display: "flex",
    flexDirection: "column",
    background: "var(--bg-surface)",
  } satisfies CSSProperties,
  leftHeader: { padding: "16px 16px 12px" } satisfies CSSProperties,
  titleRow: { display: "flex", alignItems: "center", gap: 10, marginBottom: 12 } satisfies CSSProperties,
  title: { fontSize: 18, fontWeight: 700, flex: 1 } satisfies CSSProperties,
  search: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    padding: "7px 10px",
    borderRadius: 7,
    border: "1px solid var(--border)",
    background: "var(--bg-primary)",
  } satisfies CSSProperties,
  searchInput: {
    flex: 1,
    fontSize: 13,
    background: "transparent",
    border: "none",
    outline: "none",
    color: "var(--text-primary)",
  } satisfies CSSProperties,
  list: { flex: 1, overflow: "auto", padding: "0 12px 12px", display: "flex", flexDirection: "column", gap: 8 } satisfies CSSProperties,
  right: { flex: 1, display: "flex", flexDirection: "column", minWidth: 0, minHeight: 0 } satisfies CSSProperties,
  empty: { flex: 1, display: "grid", placeItems: "center", padding: 40 } satisfies CSSProperties,
} as const;
