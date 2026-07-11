# client/docs — deep design reference

Stable design docs for `@devdigest/web`: route/page architecture, data-fetching
patterns, the `vendor/ui` design system, i18n conventions.

Single source of truth — `client/CLAUDE.md` *links* here, never copies. Keep
detail here; keep the map in CLAUDE.md.

## Docs

- [`styling.md`](styling.md) — how components are styled (`styles.ts` inline-style
  objects + CSS-variable tokens) and **why Tailwind is not used in app code**.
- [`react-compiler.md`](react-compiler.md) — prepared (not yet activated) pilot for
  the React Compiler: one-step enable, validation steps, and codebase caveats.

Suggested (not yet written): `data-fetching.md` (TanStack Query hook pattern),
`ui-kit.md` (`@devdigest/ui` layers), `i18n.md`.
