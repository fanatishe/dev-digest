/** Co-located styles for SmartDiffViewer (inline-object + CSS-var tokens; no Tailwind). */
import type { CSSProperties } from "react";

export const s = {
  wrap: { display: "flex", flexDirection: "column", gap: 20 } satisfies CSSProperties,

  // ---- intent context header ----
  intentCard: {
    display: "flex",
    flexDirection: "column",
    gap: 10,
    padding: "12px 14px",
    border: "1px solid var(--border)",
    borderRadius: 7,
    background: "var(--bg-elevated)",
  } satisfies CSSProperties,
  intentHead: { display: "flex", alignItems: "center", gap: 8 } satisfies CSSProperties,
  intentLabel: {
    fontSize: 11,
    fontWeight: 700,
    letterSpacing: "0.07em",
    textTransform: "uppercase",
    color: "var(--text-muted)",
  } satisfies CSSProperties,
  intentText: {
    margin: 0,
    fontSize: 13.5,
    lineHeight: "20px",
    color: "var(--text-primary)",
  } satisfies CSSProperties,
  chips: { display: "flex", flexWrap: "wrap", gap: 6 } satisfies CSSProperties,

  // ---- group ----
  group: { display: "flex", flexDirection: "column", gap: 10 } satisfies CSSProperties,
  groupHead: { display: "flex", alignItems: "baseline", gap: 8 } satisfies CSSProperties,
  groupTitle: {
    margin: 0,
    display: "flex",
    alignItems: "center",
    gap: 7,
    fontSize: 13,
    fontWeight: 700,
    color: "var(--text-primary)",
  } satisfies CSSProperties,
  groupDesc: { fontSize: 12, color: "var(--text-muted)" } satisfies CSSProperties,
  groupCount: { fontSize: 12, color: "var(--text-muted)", marginLeft: "auto" } satisfies CSSProperties,

  // ---- split advisory ----
  advisory: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    padding: "9px 12px",
    borderRadius: 7,
    border: "1px solid var(--warn)",
    background: "var(--warn-bg)",
    color: "var(--warn)",
    fontSize: 12.5,
  } satisfies CSSProperties,
} as const;
