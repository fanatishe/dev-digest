/* Colocated styles — inline CSSProperties + CSS-var tokens (client/docs/styling.md).
   No Tailwind, no raw hex: every color is a theme-aware token from vendor/ui/styles.css. */
import type { CSSProperties } from "react";

export const s = {
  headerRight: { display: "flex", alignItems: "center", gap: 8 } as CSSProperties,
  body: { display: "flex", flexDirection: "column", gap: 18 } as CSSProperties,
  /** The quoted, italic one-line summary — the first thing the reader sees. */
  summary: {
    margin: 0,
    fontSize: 14,
    fontStyle: "italic",
    lineHeight: 1.55,
    color: "var(--text-primary)",
  } as CSSProperties,
  cols: {
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    gap: 20,
    alignItems: "start",
  } as CSSProperties,
  colLabel: (color: string): CSSProperties => ({
    display: "flex",
    alignItems: "center",
    gap: 6,
    margin: "0 0 10px",
    fontSize: 11,
    fontWeight: 700,
    letterSpacing: "0.07em",
    textTransform: "uppercase",
    color,
  }),
  list: {
    listStyle: "none",
    margin: 0,
    padding: 0,
    display: "flex",
    flexDirection: "column",
    gap: 6,
  } as CSSProperties,
  item: {
    display: "flex",
    gap: 8,
    fontSize: 13,
    lineHeight: 1.5,
    color: "var(--text-secondary)",
  } as CSSProperties,
  bullet: { color: "var(--text-muted)" } as CSSProperties,
  chips: { display: "flex", flexWrap: "wrap", gap: 8 } as CSSProperties,
  muted: { fontSize: 13, color: "var(--text-muted)" } as CSSProperties,
  footer: {
    display: "flex",
    flexWrap: "wrap",
    gap: 6,
    alignItems: "center",
    paddingTop: 12,
    borderTop: "1px solid var(--border)",
    fontSize: 12,
    color: "var(--text-muted)",
  } as CSSProperties,
  footerSep: { color: "var(--border-strong)" } as CSSProperties,
  skeletons: { display: "flex", flexDirection: "column", gap: 10 } as CSSProperties,
} as const;
