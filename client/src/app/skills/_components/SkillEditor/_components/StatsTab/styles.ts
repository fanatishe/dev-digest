import type { CSSProperties } from "react";

export const s = {
  wrap: { padding: 28, display: "flex", flexDirection: "column", gap: 16 } satisfies CSSProperties,
  metrics: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 14 } satisfies CSSProperties,
  metric: {
    border: "1px solid var(--border)",
    borderRadius: 10,
    padding: "16px 18px",
    background: "var(--bg-elevated)",
  } satisfies CSSProperties,
  metricLabel: {
    fontSize: 11,
    fontWeight: 700,
    letterSpacing: "0.06em",
    textTransform: "uppercase",
    color: "var(--text-muted)",
  } satisfies CSSProperties,
  metricHead: {
    display: "flex",
    alignItems: "flex-start",
    justifyContent: "space-between",
    minHeight: 20,
  } satisfies CSSProperties,
  metricValue: { fontSize: 26, fontWeight: 700, marginTop: 8 } satisfies CSSProperties,
  metricUnit: { fontSize: 14, fontWeight: 500, color: "var(--text-secondary)" } satisfies CSSProperties,
  caption: { fontSize: 12, color: "var(--text-muted)", marginTop: -4 } satisfies CSSProperties,
  donutWrap: { display: "flex", justifyContent: "center", padding: "8px 0" } satisfies CSSProperties,
  panels: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 } satisfies CSSProperties,
  panel: {
    border: "1px solid var(--border)",
    borderRadius: 10,
    padding: "16px 18px",
    background: "var(--bg-elevated)",
  } satisfies CSSProperties,
  panelHeading: {
    fontSize: 11,
    fontWeight: 700,
    letterSpacing: "0.06em",
    textTransform: "uppercase",
    color: "var(--text-muted)",
    marginBottom: 12,
  } satisfies CSSProperties,
  agentRow: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    padding: "8px 0",
    borderTop: "1px solid var(--border)",
  } satisfies CSSProperties,
} as const;
