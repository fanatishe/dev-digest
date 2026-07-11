# React Compiler — pilot (prepared, not yet activated)

Status: **proposed / ready to enable** · Last updated: 2026-07-11

React Compiler auto-memoizes components and hooks at build time, so most manual
`useMemo` / `useCallback` / `React.memo` become unnecessary. This repo is a good
fit (Next 15 + React 19, `reactStrictMode` already on) and currently does almost
no manual memoization, so the compiler is low-friction to trial.

## Why this is documented instead of already on

Enabling it needs a dev dependency that isn't installed, and this workspace is
**pnpm-managed** (there is no pnpm on the current PATH, and installing with `npm`
would corrupt the symlinked `node_modules` / drop a stray `package-lock.json`).
Flipping `experimental.reactCompiler` on *without* the plugin present fails the
build. So the change is specified here for a clean one-step activation rather than
left half-applied.

## Enable (one step, run in `client/`)

```bash
pnpm add -D babel-plugin-react-compiler
```

Then set the flag in `next.config.mjs`:

```js
const nextConfig = {
  reactStrictMode: true,
  experimental: {
    reactCompiler: true, // requires babel-plugin-react-compiler (devDependency)
  },
  env: {
    NEXT_PUBLIC_API_BASE: process.env.NEXT_PUBLIC_API_BASE ?? "http://localhost:3001",
  },
};
```

> Note: turning the compiler on makes Next use Babel for the app (instead of SWC),
> which slows builds somewhat. That's expected for a pilot.

## Validate

```bash
pnpm typecheck
pnpm test           # 44 tests, incl. the both-themes smoke gallery
pnpm build          # must compile + prerender the same 8 routes
```

Then a manual smoke of the interactive-heavy screens (they rely on referential
identity and effects, the areas a compiler is most likely to perturb):

- `/repos/:id/pulls/:n` — Findings tab: run a review, live `RunStatus` stream,
  cancel, open a run trace, the finding **reveal-by-nonce** flow (deep-link
  `?finding=` + timeline popover click), and the `?severity=` filter.
- `/agents/:id` — switch agents (the `key={agent.id}` form reset) and save.
- Any modal / the `useConfirm` dialog (focus trap, Escape).

## Roll back

Remove the `experimental.reactCompiler` flag (and optionally the devDependency).
No source changes are required — the compiler is purely a build-time transform.

## Caveats specific to this codebase

- **`styles.ts` factories still allocate.** `s.card(active)` returns a fresh object
  per call; the compiler won't dedupe those (they're function calls with changing
  args). See [`styling.md`](styling.md). No regression — just not a win there.
- **Rules-of-Hooks must be clean.** The compiler bails (silently, per-component) on
  code that breaks the rules. Add the `eslint-plugin-react-compiler` lint rule when
  piloting to surface bail-outs instead of shipping un-optimized components.
- **StrictMode is on**, so double-invoke behavior is already exercised in dev; the
  promise-based `useConfirm` resolve-in-updater is idempotent and safe under it.
- **Don't start deleting `useMemo`/`useCallback` yet.** Ship the compiler first,
  confirm green, then remove manual memoization opportunistically — not in the same
  change.
