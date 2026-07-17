/* Colocated styles — inline CSSProperties + CSS-var tokens (client/docs/styling.md).
   No Tailwind, no raw hex: every colour is a theme-aware token from vendor/ui/styles.css. */
import type { CSSProperties } from "react";

export const s = {
  header: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    margin: "0 0 10px",
  } as CSSProperties,
  label: (color: string): CSSProperties => ({
    display: "flex",
    alignItems: "center",
    gap: 6,
    margin: 0,
    fontSize: 11,
    fontWeight: 700,
    letterSpacing: "0.07em",
    textTransform: "uppercase",
    color,
  }),
  headerRight: { display: "flex", alignItems: "center", gap: 8, marginLeft: "auto" } as CSSProperties,
  levelDot: (color: string): CSSProperties => ({
    width: 8,
    height: 8,
    borderRadius: 99,
    background: color,
    flex: "0 0 auto",
  }),
  chips: { display: "flex", flexWrap: "wrap", gap: 8 } as CSSProperties,
  fallbackNote: {
    fontSize: 11,
    color: "var(--text-muted)",
    margin: "0 0 8px",
  } as CSSProperties,
  emptyHint: { fontSize: 13, color: "var(--text-secondary)", margin: "0 0 10px", lineHeight: 1.5 } as CSSProperties,

  // The list of selectable finding blocks. Each row: [icon + stacked text] … [chevron].
  risks: { display: "flex", flexDirection: "column", gap: 6 } as CSSProperties,
  risk: (selected: boolean): CSSProperties => ({
    display: "flex",
    alignItems: "stretch",
    border: `1px solid ${selected ? "var(--accent)" : "var(--border)"}`,
    borderRadius: 6,
    background: "var(--bg-elevated)",
    overflow: "hidden",
  }),
  riskMain: {
    display: "flex",
    alignItems: "flex-start",
    gap: 8,
    flex: 1,
    minWidth: 0,
    padding: "9px 6px 9px 11px",
    background: "none",
    border: "none",
    cursor: "pointer",
    textAlign: "left",
  } as CSSProperties,
  // The stacked text column — title over file:line — that wraps within the row.
  riskText: {
    display: "flex",
    flexDirection: "column",
    gap: 2,
    minWidth: 0,
    flex: 1,
  } as CSSProperties,
  riskTitle: {
    fontSize: 13,
    fontWeight: 600,
    color: "var(--text-primary)",
    overflowWrap: "anywhere",
  } as CSSProperties,
  riskRef: {
    fontSize: 12,
    fontWeight: 400,
    color: "var(--text-muted)",
    overflowWrap: "anywhere",
  } as CSSProperties,
  chevronBtn: {
    display: "flex",
    alignItems: "center",
    flex: "0 0 auto",
    padding: "0 11px",
    background: "none",
    border: "none",
    // A hairline divider between the block body and the toggle, matching the card border.
    borderLeft: "1px solid var(--border)",
    cursor: "pointer",
  } as CSSProperties,
  chevron: (open: boolean): CSSProperties => ({
    flex: "0 0 auto",
    color: "var(--text-muted)",
    transform: open ? "rotate(90deg)" : "none",
    transition: "transform .12s",
  }),

  // The single shared detail panel, rendered once below the list for the selected block.
  detail: {
    display: "flex",
    flexDirection: "column",
    gap: 8,
    marginTop: 8,
    padding: "11px 13px",
    border: "1px solid var(--border)",
    borderRadius: 6,
    background: "var(--bg-surface)",
    fontSize: 13,
    color: "var(--text-secondary)",
    lineHeight: 1.55,
  } as CSSProperties,
  explanation: { margin: 0 } as CSSProperties,
  suggestion: { margin: 0, color: "var(--text-muted)" } as CSSProperties,
  detailRef: {
    alignSelf: "flex-start",
    maxWidth: "100%",
    background: "none",
    border: "none",
    padding: 0,
    fontSize: 12,
    cursor: "pointer",
    color: "var(--text-secondary)",
    textDecoration: "underline",
    textUnderlineOffset: 2,
    textAlign: "left",
    overflowWrap: "anywhere",
  } as CSSProperties,
} as const;
