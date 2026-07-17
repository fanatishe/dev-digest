import type { CSSProperties } from "react";

/** Co-located styles for the skill Context tab's document preview drawer. Inline-
    object + CSS-var tokens (house convention — no Tailwind in app code). */
export const s = {
  title: { display: "flex", alignItems: "center", gap: 8, minWidth: 0 } satisfies CSSProperties,
  titlePath: { overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" } satisfies CSSProperties,
  metaRow: {
    display: "flex",
    alignItems: "center",
    gap: 12,
    flexWrap: "wrap",
    fontSize: 12.5,
    color: "var(--text-muted)",
    marginBottom: 16,
  } satisfies CSSProperties,
  toggleRow: { marginBottom: 18 } satisfies CSSProperties,
  body: { fontSize: 13.5, minWidth: 0 } satisfies CSSProperties,
  loadingWrap: { display: "flex", flexDirection: "column", gap: 8 } satisfies CSSProperties,
  note: { fontSize: 12.5, color: "var(--text-muted)", lineHeight: 1.5 } satisfies CSSProperties,
} as const;
