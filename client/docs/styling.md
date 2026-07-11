# Styling — how `@devdigest/web` is styled (and why Tailwind is *not* used in app code)

Status: **accepted** · Last updated: 2026-07-11

This is a decision record. It exists because the setup looks contradictory at a
glance — Tailwind v4 is installed, yet almost no component uses a utility class.

## The decision

**App components style via colocated `styles.ts` inline-style objects and CSS
custom properties (design tokens) — not Tailwind utility classes.**

Each component folder carries a `styles.ts` exporting an `s` object of
`CSSProperties` (static objects, or small factories like `s.card(active)` for
state-dependent styles):

```ts
// styles.ts
export const s = {
  card: (active: boolean): CSSProperties => ({
    padding: 14,
    borderRadius: 8,
    border: "1px solid " + (active ? "var(--border-strong)" : "var(--border)"),
    background: active ? "var(--bg-hover)" : "var(--bg-elevated)",
  }),
} as const;
```

Colors/spacing come from **CSS variables** (`var(--accent)`, `var(--text-muted)`,
`var(--bg-elevated)`, …) defined by the design system, which is what makes theming
(light/dark, density) work at runtime via `data-theme` / `data-density` on `<html>`.

## Where Tailwind actually lives

Tailwind v4 is pulled in **once**, by the design system's stylesheet
(`vendor/ui/styles.css` does `@import "tailwindcss"`), which `app/globals.css`
imports. It underpins the `vendor/ui` layer and a few global utility classes
(e.g. `.mono`). **App/feature code does not author Tailwind classes** — so
`className="flex gap-2 …"` is intentionally absent from `src/app/**`.

## Why this way

- **Runtime theming via tokens.** The product ships light/dark + density themes
  toggled on `<html>`; CSS-variable-driven inline styles re-resolve for free.
  Utility classes would need theme-variant duplication.
- **Strict colocation.** `styles.ts` sits next to its component (see
  `frontend-ui-architecture`), so styles move/delete with the component and never
  drift into a global stylesheet.
- **Design-system boundary.** Reusable visual decisions live in `vendor/ui`
  primitives (`Button`, `Badge`, …); app code composes those, so it rarely needs
  raw styling in the first place.

## Trade-offs (known, accepted)

- **No `React.memo` free lunch on style props.** Style *factories* (`s.card(x)`)
  allocate a new object each render, so passing `style={s.card(a)}` to a
  `React.memo` child breaks referential equality. In practice this is a non-issue
  (few memoized children); if a hot path needs it, memoize the style object.
- **No utility ergonomics / responsive prefixes.** Responsive behavior is done with
  explicit styles, not `sm:`/`md:`. Acceptable for a desktop-first studio UI.
- **Two mental models coexist** (tokens+inline in app code, Tailwind inside the
  design system). This doc is the reconciliation.

## Guidance for new code

- Author component styles in a colocated `styles.ts` using CSS-variable tokens.
- Reach for a `vendor/ui` primitive before styling from scratch; extend the
  design system if a primitive is missing.
- Do **not** introduce Tailwind utility classes in `src/app/**` or
  `src/components/**` — keep them (if ever) inside `vendor/ui`.
- Never hard-code hex colors that a token already expresses (`var(--…)`).

## Alternatives considered

- **Adopt Tailwind in app code** — rejected: loses the token-driven runtime
  theming the product depends on, and duplicates decisions already owned by
  `vendor/ui`.
- **Remove Tailwind entirely** — rejected: the `vendor/ui` layer relies on it;
  removing it is a design-system change out of scope here.
