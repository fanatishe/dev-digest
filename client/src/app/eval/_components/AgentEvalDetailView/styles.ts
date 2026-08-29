import type { CSSProperties } from "react";

export const s = {
  page: { padding: "24px 32px 44px", maxWidth: 1100, margin: "0 auto" } satisfies CSSProperties,
  header: { display: "flex", alignItems: "flex-start", gap: 14, marginBottom: 22 } satisfies CSSProperties,
  headerText: { flex: 1 } satisfies CSSProperties,
  back: {
    display: "inline-flex",
    alignItems: "center",
    gap: 4,
    fontSize: 12.5,
    color: "var(--text-secondary)",
    textDecoration: "none",
    marginBottom: 6,
  } satisfies CSSProperties,
  h1: { fontSize: 24, fontWeight: 700, letterSpacing: "-0.02em" } satisfies CSSProperties,
  subtitle: {
    fontSize: 14,
    color: "var(--text-secondary)",
    marginTop: 4,
    maxWidth: 620,
  } satisfies CSSProperties,
  runError: {
    padding: "10px 14px",
    borderRadius: 8,
    border: "1px solid var(--warn)",
    background: "var(--warn-bg, transparent)",
    color: "var(--warn)",
    fontSize: 12.5,
    marginBottom: 16,
  } satisfies CSSProperties,
  cards: { display: "flex", gap: 14, marginBottom: 26 } satisfies CSSProperties,
  section: { marginTop: 26 } satisfies CSSProperties,
  note: {
    padding: "18px 4px",
    fontSize: 13,
    color: "var(--text-muted)",
  } satisfies CSSProperties,
} as const;
