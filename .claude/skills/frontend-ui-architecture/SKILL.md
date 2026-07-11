---
name: frontend-ui-architecture
description: "Frontend UI architecture — code structure & organization for React + Next.js App Router. Use when deciding WHERE code goes: folder/file layout, thin pages vs feature components, route-scoped vs shared, and the placement of constants, helpers/utils, styles, types, business logic, and data-fetching hooks. Companion to react-best-practices (component/hook internals) and next-best-practices (framework APIs)."
version: 1.0.0
---

# Frontend UI Architecture — Code Structure & Organization

The **macro** rules: given a piece of frontend code, *where does it live?* This skill
prescribes **one canonical layout** for React + Next.js (App Router), grounded in the
DevDigest `client/` package. For code examples see [examples.md](examples.md); for the
full folder map and the "where does X go?" decision tree see [structure.md](structure.md).

## Scope — what this skill owns (and what it doesn't)

- **This skill:** folder structure, file boundaries, layering/dependency direction,
  colocation, where each *kind* of code lives. Structure, not internals.
- **`react-best-practices`:** what goes *inside* a component/hook — derive-don't-store,
  useEffect misuse, memoization, keys, conditional rendering. Defer internals there.
- **`next-best-practices`:** framework APIs — RSC boundaries, `params`/`searchParams`,
  metadata, route handlers, image/font. Defer framework mechanics there.

When a rule is about *placement*, it's here. When it's about *implementation*, cross-link.

## Severity

- **CRITICAL** — breaks routing, bundling, or the dependency graph; causes real bugs.
- **HIGH** — erodes scalability, testability, or ownership boundaries.
- **MEDIUM** — hurts consistency and developer experience.

---

## The canonical layout (CRITICAL)

```
client/src/
├── app/                     # Next.js App Router — ROUTES ONLY. Pages stay thin.
│   └── <route>/
│       ├── page.tsx         # thin entry: renders one <View/>, nothing else
│       ├── layout.tsx       # route chrome (optional)
│       ├── constants.ts     # route-level constants (optional)
│       ├── helpers.ts       # route-level pure helpers (optional)
│       └── _components/     # route-SCOPED features (private: `_` = not routable)
│           └── <Feature>/   # one folder per component — see anatomy below
├── components/              # CROSS-ROUTE shared components (app-shell, widgets)
│   └── <Name>/
├── lib/                     # non-visual app logic
│   ├── api.ts               # the ONLY module that talks to the network
│   ├── hooks/               # data-fetching + query hooks (TanStack Query) — ALL fetches
│   ├── *.ts                 # pure utils (format-cost, github-urls, model-label)
│   └── *.tsx                # cross-cutting providers (theme, toast, context)
├── vendor/ui/               # design system — import via the `@devdigest/ui` barrel
├── vendor/shared/           # Zod contracts — import via `@devdigest/shared`
├── i18n/  + messages/       # user-facing strings (next-intl) — never inline literals
└── test/                    # shared test setup
```

**The single most important rule:** `app/` is for **routing**. Feature UI lives in
colocated `_components/` folders, not in `page.tsx`. A route is only public once
`page.tsx`/`route.ts` exists, so everything else in the segment is safely colocated.

## Layering & dependency direction (CRITICAL)

Imports flow **one way** — leaf → shared, never the reverse:

```
vendor/ui, vendor/shared   (foundation — depends on nothing local)
        ▲
      lib/  (api, hooks, utils, providers)
        ▲
   components/  (shared UI)
        ▲
  app/**/_components/  (route-scoped features)
        ▲
      app/**/page.tsx  (routes — compose the above)
```

- A **route-scoped** `_components/` folder may import from `lib`, `components`, `vendor`.
- A **shared** `components/` file must NOT import from any route's `_components/`.
- **Never import across sibling features/routes.** If two routes need the same code,
  promote it to `components/` or `lib/` — don't reach sideways. (Enforce with ESLint
  `import/no-restricted-paths` if desired.)

## Route pages are thin (HIGH)

`page.tsx` imports one view component and renders it. No data fetching, no business
logic, no styles inline. Everything else is colocated under `_components/<View>/`.

## Component folder anatomy (HIGH)

Every non-trivial component is a **folder**, not a lone file. Add each file **only when
it has content** — don't scaffold empties.

```
<ComponentName>/
├── ComponentName.tsx        # the component ("use client" only if it needs the client)
├── ComponentName.test.tsx   # colocated test (vitest + jsdom)
├── index.ts                 # barrel: export { ComponentName, ComponentName as default }
├── constants.ts             # static data, lookup tables, enums-as-consts
├── helpers.ts               # PURE functions — business logic & derivations (+ helpers.test.ts)
├── styles.ts                # colocated styles (`export const s = { … }`)
└── _components/             # nested private sub-components — same anatomy, recursively
```

- **File order inside `ComponentName.tsx`:** imports → types → component → (small local helpers last).
  Non-trivial helpers move to `helpers.ts`; non-trivial constants to `constants.ts`.
- **Business logic ≠ JSX.** Pure, testable logic goes in `helpers.ts`; stateful/effectful
  logic goes in a **hook** (in the folder if local, in `lib/hooks` if it fetches data).
  Component bodies orchestrate; they don't compute. (See `react-best-practices`.)

## Where does X go? (HIGH)

| Code | Local to one component | Shared across the app |
|------|------------------------|-----------------------|
| Component | `<route>/_components/<Name>/` | `src/components/<Name>/` |
| Pure helper / derivation | `<Name>/helpers.ts` | `src/lib/<name>.ts` |
| Constant / lookup table | `<Name>/constants.ts` | `src/lib/<name>.ts` |
| Styles | `<Name>/styles.ts` | design system → `vendor/ui` |
| Data fetch / mutation | — (never local) | `src/lib/hooks/*` (TanStack Query) |
| Network call | — (never in a component) | `src/lib/api.ts` only |
| Response/domain type | — | `@devdigest/shared` (Zod contracts) |
| UI primitive (Button, Badge) | — | `@devdigest/ui` barrel |
| User-facing string | — | `messages/<locale>/*.json` |

**Rule of thumb (colocation):** *place code as close to where it's used as possible.*
Start colocated; promote to `components/`/`lib/` only when a **second** consumer appears.
Premature "shared" folders age worse than a little duplication.

## Barrel files (CRITICAL)

- ✅ **Per-component `index.ts`** with a *single* named + default re-export is fine and is
  the house style — it's cheap and keeps import paths stable.
- ❌ **Wide aggregation barrels** (`export *` / re-exporting a whole folder of modules)
  break tree-shaking, inflate bundles, slow the dev server, and invite circular imports.
  For app-internal shared code, **import from the file you need**, not a mega-barrel.
- The design-system barrel (`@devdigest/ui`) is the sanctioned exception: it's the
  **public edge of a package**, where a barrel belongs. Never deep-import past it.

## Naming (MEDIUM)

- **Folders/components:** `PascalCase` (`AgentCard/`, `RunTraceDrawer/`).
- **Route segments:** lowercase, kebab where needed; dynamic `[id]`, private `_components`.
- **Bundle files are plural** because they hold many definitions: `constants.ts`,
  `helpers.ts`, `styles.ts`, `hooks/*`, `types.ts`.
- **One component per file**; the file name matches the exported component.

## Promotion checklist (MEDIUM)

Move route-scoped → shared (`components/`/`lib/`) when **all** hold:
1. A second, unrelated route needs it.
2. It has no route-specific assumptions baked in.
3. Its name/API describe a general capability, not one screen.

If only one is true, keep it colocated. Sharing too early couples unrelated features.

---

See [structure.md](structure.md) for the annotated tree + decision tree, and
[examples.md](examples.md) for good/bad grounded examples. Sources & versioning:
[README.md](README.md).
