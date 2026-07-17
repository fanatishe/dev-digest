/* Colocated styles — inline CSSProperties + CSS-var tokens (client/docs/styling.md). */
import type { CSSProperties } from "react";

export const s = {
  section: { marginTop: 4 } as CSSProperties,
  list: {
    listStyle: "none",
    margin: 0,
    padding: 0,
    display: "flex",
    flexDirection: "column",
    gap: 8,
  } as CSSProperties,
  item: {
    display: "flex",
    gap: 12,
    alignItems: "flex-start",
    padding: "10px 14px",
    border: "1px solid var(--border)",
    borderRadius: 8,
    background: "var(--bg-elevated)",
  } as CSSProperties,
  ordinal: {
    flex: "0 0 auto",
    fontSize: 12,
    fontWeight: 700,
    color: "var(--text-muted)",
    minWidth: 18,
  } as CSSProperties,
  ref: { flex: "0 1 auto", minWidth: 0 } as CSSProperties,
  reason: {
    flex: 1,
    minWidth: 0,
    fontSize: 13,
    lineHeight: 1.5,
    color: "var(--text-secondary)",
  } as CSSProperties,
  link: {
    background: "none",
    border: "none",
    padding: 0,
    fontSize: 13,
    cursor: "pointer",
    color: "var(--text-secondary)",
    textDecoration: "underline",
    textUnderlineOffset: 2,
    textAlign: "left",
    overflowWrap: "anywhere",
  } as CSSProperties,
  notInDiff: {
    fontSize: 13,
    color: "var(--text-muted)",
    cursor: "help",
    textDecoration: "underline dotted",
    textUnderlineOffset: 2,
  } as CSSProperties,
  count: {
    fontSize: 11,
    fontWeight: 600,
    color: "var(--text-muted)",
  } as CSSProperties,
} as const;
