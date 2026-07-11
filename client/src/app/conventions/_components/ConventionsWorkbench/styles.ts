import type React from "react";

export const s = {
  wrap: { padding: 28, maxWidth: 980, margin: "0 auto", display: "flex", flexDirection: "column", gap: 20 } as React.CSSProperties,
  header: { display: "flex", alignItems: "flex-start", gap: 16 } as React.CSSProperties,
  headingBlock: { flex: 1, minWidth: 0 } as React.CSSProperties,
  heading: { fontSize: 24, fontWeight: 700, margin: 0 } as React.CSSProperties,
  repoName: { color: "var(--accent, #6ea8fe)" } as React.CSSProperties,
  subtitle: { marginTop: 6, fontSize: 13, color: "var(--text-secondary)" } as React.CSSProperties,
  toolbar: { display: "flex", alignItems: "center", gap: 12 } as React.CSSProperties,
  count: { fontSize: 12.5, color: "var(--text-muted)" } as React.CSSProperties,
  list: { display: "flex", flexDirection: "column", gap: 14 } as React.CSSProperties,
};
