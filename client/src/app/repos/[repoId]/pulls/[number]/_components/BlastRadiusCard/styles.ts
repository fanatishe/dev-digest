import type { CSSProperties } from "react";

export const s = {
  headerRight: {
    display: "flex",
    alignItems: "center",
    gap: 8,
  } satisfies CSSProperties,

  // ---- stat row ------------------------------------------------------------
  stats: {
    display: "flex",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 14,
    marginBottom: 14,
  } satisfies CSSProperties,
  stat: {
    display: "inline-flex",
    alignItems: "center",
    gap: 5,
    fontSize: 12,
    color: "var(--text-muted)",
  } satisfies CSSProperties,
  statNum: {
    fontWeight: 600,
    color: "var(--text-primary)",
  } satisfies CSSProperties,

  // ---- view toggle ---------------------------------------------------------
  toggle: {
    display: "inline-flex",
    border: "1px solid var(--border)",
    borderRadius: 6,
    overflow: "hidden",
  } satisfies CSSProperties,
  toggleBtn: (active: boolean): CSSProperties => ({
    padding: "3px 10px",
    fontSize: 11,
    textTransform: "capitalize",
    border: "none",
    cursor: "pointer",
    background: active ? "var(--bg-hover)" : "transparent",
    color: active ? "var(--text-primary)" : "var(--text-muted)",
  }),

  // ---- tree ----------------------------------------------------------------
  tree: {
    display: "flex",
    flexDirection: "column",
    gap: 2,
  } satisfies CSSProperties,
  symbolRow: {
    display: "flex",
    alignItems: "center",
    gap: 6,
    width: "100%",
    padding: "6px 4px",
    background: "transparent",
    border: "none",
    borderRadius: 6,
    cursor: "pointer",
    textAlign: "left",
    color: "var(--text-primary)",
  } satisfies CSSProperties,
  symbolName: {
    fontFamily: "var(--font-mono)",
    fontSize: 13,
    color: "var(--accent)",
  } satisfies CSSProperties,
  callerCount: {
    marginLeft: "auto",
    fontSize: 11,
    color: "var(--text-muted)",
  } satisfies CSSProperties,
  children: {
    display: "flex",
    flexDirection: "column",
    gap: 4,
    padding: "2px 0 8px 22px",
  } satisfies CSSProperties,
  callerLink: {
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    fontFamily: "var(--font-mono)",
    fontSize: 12,
    color: "var(--text-secondary)",
    textDecoration: "none",
    width: "fit-content",
  } satisfies CSSProperties,
  badges: {
    display: "flex",
    flexWrap: "wrap",
    gap: 6,
    marginTop: 6,
  } satisfies CSSProperties,
  muted: {
    fontSize: 12,
    color: "var(--text-muted)",
    fontStyle: "italic",
  } satisfies CSSProperties,

  // ---- graph ---------------------------------------------------------------
  svg: {
    display: "block",
    width: "100%",
    height: "auto",
    maxWidth: "100%",
    overflow: "visible",
  } satisfies CSSProperties,
  legend: {
    display: "flex",
    flexWrap: "wrap",
    gap: 14,
    marginTop: 10,
    fontSize: 11,
    color: "var(--text-muted)",
  } satisfies CSSProperties,
  legendItem: {
    display: "inline-flex",
    alignItems: "center",
    gap: 5,
  } satisfies CSSProperties,
  legendDot: (color: string): CSSProperties => ({
    width: 7,
    height: 7,
    borderRadius: "50%",
    background: color,
  }),

  // ---- degraded note -------------------------------------------------------
  degraded: {
    display: "flex",
    gap: 8,
    alignItems: "flex-start",
    padding: "9px 11px",
    marginBottom: 12,
    border: "1px solid var(--warn)",
    borderRadius: 6,
    background: "var(--warn-bg)",
    fontSize: 12,
    lineHeight: 1.5,
    color: "var(--text-secondary)",
  } satisfies CSSProperties,

  // ---- prior PRs -----------------------------------------------------------
  priorPrs: {
    marginTop: 14,
    borderTop: "1px solid var(--border)",
    paddingTop: 12,
  } satisfies CSSProperties,
  disclosure: {
    display: "flex",
    alignItems: "center",
    gap: 6,
    width: "100%",
    padding: 0,
    background: "transparent",
    border: "none",
    cursor: "pointer",
    fontSize: 12,
    color: "var(--text-secondary)",
    textAlign: "left",
  } satisfies CSSProperties,
  prList: {
    display: "flex",
    flexDirection: "column",
    gap: 12,
    listStyle: "none",
    margin: "12px 0 0",
    padding: 0,
  } satisfies CSSProperties,
  prItem: {
    display: "flex",
    flexDirection: "column",
    gap: 3,
  } satisfies CSSProperties,
  prHead: {
    display: "flex",
    alignItems: "baseline",
    gap: 8,
    flexWrap: "wrap",
  } satisfies CSSProperties,
  prNumber: {
    fontFamily: "var(--font-mono)",
    fontSize: 12,
    color: "var(--accent)",
    textDecoration: "none",
  } satisfies CSSProperties,
  prTitle: {
    fontSize: 13,
    color: "var(--text-primary)",
  } satisfies CSSProperties,
  prMeta: {
    fontSize: 11,
    color: "var(--text-muted)",
  } satisfies CSSProperties,
  prNotes: {
    fontSize: 12,
    color: "var(--text-secondary)",
    lineHeight: 1.5,
  } satisfies CSSProperties,

  skeletons: {
    display: "flex",
    flexDirection: "column",
    gap: 10,
  } satisfies CSSProperties,
} as const;

/** Node colours, shared by the graph and its legend so they cannot drift apart. */
export const GRAPH_COLORS = {
  symbol: "var(--accent)",
  caller: "var(--text-muted)",
  endpoint: "var(--ok)",
} as const;
