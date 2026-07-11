import type { CSSProperties } from "react";

export const s = {
  wrap: { padding: 28, maxWidth: 900, display: "flex", flexDirection: "column", gap: 16 } satisfies CSSProperties,
  header: { display: "flex", alignItems: "center" } satisfies CSSProperties,
  h2: { fontSize: 16, fontWeight: 700, flex: 1 } satisfies CSSProperties,
  enabledLabel: { display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: "var(--text-secondary)" } satisfies CSSProperties,
  editor: { border: "1px solid var(--border)", borderRadius: 8, overflow: "hidden", background: "var(--bg-primary)" } satisfies CSSProperties,
  editorBar: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    padding: "7px 12px",
    borderBottom: "1px solid var(--border)",
    background: "var(--bg-surface)",
  } satisfies CSSProperties,
  fileName: { fontSize: 12, color: "var(--text-secondary)" } satisfies CSSProperties,
  tokens: { fontSize: 11.5, color: "var(--text-muted)" } satisfies CSSProperties,
  actions: { display: "flex", alignItems: "center", gap: 10 } satisfies CSSProperties,
  snapshotNote: { marginLeft: "auto", fontSize: 12.5, color: "var(--text-muted)" } satisfies CSSProperties,
  dangerZone: {
    display: "flex",
    alignItems: "center",
    gap: 16,
    marginTop: 8,
    paddingTop: 20,
    borderTop: "1px solid var(--border)",
  } satisfies CSSProperties,
  dangerHeading: { fontSize: 14, fontWeight: 600, color: "var(--crit)" } satisfies CSSProperties,
  dangerBody: { fontSize: 12.5, color: "var(--text-muted)", marginTop: 2 } satisfies CSSProperties,
} as const;
