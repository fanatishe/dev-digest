# CLAUDE.md — client (`@devdigest/web`)

Next.js 15 (App Router) studio UI: import repos, browse PRs, run/read reviews,
author agents. Data via TanStack Query over the Fastify API. Read `../CLAUDE.md`
first. Map, not docs — keep ≤100 lines; link, don't copy.

## Commands

- `pnpm dev` (`:3000`) · `pnpm build` · `pnpm start`
- `pnpm test` (vitest + jsdom, `fetch` mocked — no API/DB/browser needed)
- `pnpm typecheck`

## Conventions (non-default)

- **API base** is `NEXT_PUBLIC_API_BASE` (default `http://localhost:3001`), used only
  by `src/lib/api.ts`. Every data fetch goes through a **hook in `src/lib/hooks/*`**
  (TanStack Query) — components don't call `fetch`/`api` directly.
- **UI primitives: always import from `@devdigest/ui`** (the barrel at
  `src/vendor/ui/index.ts`). Never reach into a layer file directly. Import
  `@devdigest/ui/styles.css` once at the app root.
- **Contracts come from `@devdigest/shared`** (`src/vendor/shared`) — the same Zod
  shapes the server serializes. Don't redefine response types locally.
- **Pages are thin.** Feature logic sits in colocated `_components/<Name>/` folders,
  each with its own `*.test.tsx`. App chrome (nav, breadcrumbs, shortcuts) is in
  `src/components/app-shell`.
- **i18n:** user-facing strings live in `messages/<locale>/*.json` (`next-intl`), not
  inline literals.

## Gotchas / do-not-touch

- `vendor/ui` and `vendor/shared` are **this project's own** design system / contracts
  (copy-vendored), not third-party — edit deliberately, keep in sync with the server.
- Component tests mock `fetch`; the real browser journeys live in `../e2e` — don't try
  to hit a live API from a `*.test.tsx`.

## Read when

- The route/page map + which API each screen uses → `README.md`
- Data-fetching / hook / query-key patterns → `docs/`
- UI-facing contracts & screen specs → `specs/` + `src/vendor/shared/contracts/`
- The design system layers → `src/vendor/ui/README.md`
- A surprising behavior (RSC boundary, hydration, cache) → `INSIGHTS.md`
