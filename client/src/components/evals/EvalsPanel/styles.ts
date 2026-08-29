import type React from "react";

export const s = {
  wrap: { padding: 24, display: "flex", flexDirection: "column", gap: 20 },
  metricsHead: { display: "flex", flexDirection: "column", gap: 8 },
  cards: { display: "flex", gap: 12 },
  caption: { margin: 0, fontSize: 12.5, color: "var(--text-muted)" },
  actions: { display: "flex", alignItems: "center", gap: 8 },
  loading: { display: "flex", flexDirection: "column", gap: 10 },
  runError: {
    fontSize: 13,
    color: "var(--crit)",
    background: "var(--crit-bg)",
    border: "1px solid var(--crit)",
    borderRadius: 7,
    padding: "8px 12px",
  },
  dashboardLink: { display: "flex", justifyContent: "flex-end" },
  link: { fontSize: 13, fontWeight: 600, color: "var(--accent)", textDecoration: "none" },
} satisfies Record<string, React.CSSProperties>;
