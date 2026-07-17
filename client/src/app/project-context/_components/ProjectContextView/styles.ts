import type { CSSProperties } from "react";

/** Co-located styles for the Project Context two-pane master–detail page. Inline-
    object + CSS-var tokens (house convention — no Tailwind in app code). */
export const s = {
  page: { padding: "28px 32px", maxWidth: 1200, margin: "0 auto" } satisfies CSSProperties,
  header: { marginBottom: 20 } satisfies CSSProperties,
  title: { fontSize: 20, fontWeight: 700, letterSpacing: "-0.01em" } satisfies CSSProperties,
  subtitle: { fontSize: 13.5, color: "var(--text-secondary)", marginTop: 6, lineHeight: 1.5 } satisfies CSSProperties,

  // ---- two-pane grid ----
  twoPane: {
    display: "grid",
    gridTemplateColumns: "minmax(280px, 360px) 1fr",
    gap: 20,
    alignItems: "start",
  } satisfies CSSProperties,

  // ---- left / master ----
  master: { display: "flex", flexDirection: "column", gap: 12, minWidth: 0 } satisfies CSSProperties,
  toolbar: { display: "flex", alignItems: "center", gap: 12 } satisfies CSSProperties,
  count: { fontSize: 12.5, color: "var(--text-muted)", flexShrink: 0 } satisfies CSSProperties,
  filterInput: {
    fontSize: 13,
    padding: "8px 12px",
    borderRadius: 7,
    border: "1px solid var(--border)",
    background: "var(--bg-surface)",
    color: "var(--text-primary)",
    outline: "none",
    flex: 1,
    minWidth: 0,
  } satisfies CSSProperties,
  list: { display: "flex", flexDirection: "column", gap: 6, maxHeight: "calc(100vh - 220px)", overflow: "auto" } satisfies CSSProperties,
  row: {
    display: "flex",
    alignItems: "center",
    gap: 12,
    padding: "10px 12px",
    border: "1px solid var(--border)",
    borderRadius: 8,
    background: "var(--bg-elevated)",
    cursor: "pointer",
    textAlign: "left",
    width: "100%",
    font: "inherit",
    color: "inherit",
  } satisfies CSSProperties,
  rowSelected: {
    // Full `border` shorthand (not `borderColor` longhand): `row` sets the `border`
    // shorthand, and mixing shorthand + longhand on the same element when this is
    // spread over `row` on select/deselect triggers React's "Removing a style
    // property during rerender" warning and can mis-style the accent border.
    border: "1px solid var(--accent)",
    background: "var(--bg-hover)",
  } satisfies CSSProperties,
  rowIcon: { color: "var(--text-muted)", flexShrink: 0 } satisfies CSSProperties,
  rowText: { display: "flex", flexDirection: "column", gap: 2, flex: 1, minWidth: 0 } satisfies CSSProperties,
  rowName: { fontSize: 13, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" } satisfies CSSProperties,
  rowDir: { fontSize: 11.5, color: "var(--text-muted)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" } satisfies CSSProperties,
  rowBadge: { flexShrink: 0, letterSpacing: "0.04em" } satisfies CSSProperties,
  loadingWrap: { display: "flex", flexDirection: "column", gap: 8 } satisfies CSSProperties,

  // ---- right / detail preview pane ----
  pane: {
    border: "1px solid var(--border)",
    borderRadius: 10,
    background: "var(--bg-surface)",
    minHeight: 360,
    display: "flex",
    flexDirection: "column",
    minWidth: 0,
  } satisfies CSSProperties,
  paneHeader: {
    display: "flex",
    alignItems: "center",
    gap: 12,
    padding: "14px 18px",
    borderBottom: "1px solid var(--border)",
    flexWrap: "wrap",
  } satisfies CSSProperties,
  paneTitleBlock: { display: "flex", flexDirection: "column", gap: 2, minWidth: 0 } satisfies CSSProperties,
  paneFilename: { fontSize: 14, fontWeight: 700 } satisfies CSSProperties,
  panePath: { fontSize: 11.5, color: "var(--text-muted)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" } satisfies CSSProperties,
  paneTokens: { fontSize: 12.5, color: "var(--text-muted)", flexShrink: 0 } satisfies CSSProperties,
  paneUsedBy: { fontSize: 12.5, color: "var(--text-muted)", marginLeft: "auto" } satisfies CSSProperties,
  paneTabsBar: { padding: "0 8px", borderBottom: "1px solid var(--border)" } satisfies CSSProperties,
  paneBody: { padding: "18px", overflow: "auto", flex: 1, minWidth: 0 } satisfies CSSProperties,
  paneNote: { fontSize: 12, color: "var(--text-muted)", margin: "0 0 10px", lineHeight: 1.5 } satisfies CSSProperties,
  panePlaceholder: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    minHeight: 360,
    padding: "40px 28px",
    textAlign: "center",
    color: "var(--text-muted)",
    fontSize: 13.5,
  } satisfies CSSProperties,
} as const;
