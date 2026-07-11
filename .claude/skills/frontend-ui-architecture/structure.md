# Folder Structure & the "Where does X go?" Decision Tree

Deep reference for [SKILL.md](SKILL.md). This is the annotated canonical layout plus a
decision procedure for placing any new piece of code.

## Annotated tree (grounded in DevDigest `client/`)

```
client/src/
│
├── app/                              # ROUTING LAYER — Next.js App Router
│   ├── layout.tsx                    # root layout: providers, app-shell, <html>/<body>
│   ├── page.tsx                      # "/" — thin: renders one view component
│   ├── globals.css                   # global stylesheet (imported once, here)
│   │
│   ├── agents/                       # route segment → /agents
│   │   ├── page.tsx                  # thin entry → <AgentsListView/>
│   │   └── _components/              # route-SCOPED (private, not routable)
│   │       ├── AgentsListView/       # a "view" = the screen's top feature component
│   │       │   ├── AgentsListView.tsx
│   │       │   ├── index.ts
│   │       │   ├── constants.ts
│   │       │   ├── helpers.ts
│   │       │   ├── styles.ts
│   │       │   └── _components/       # nested sub-features, same anatomy
│   │       │       └── CreateAgentModal/
│   │       └── AgentCard/            # a smaller reused-within-route component
│   │           ├── AgentCard.tsx
│   │           ├── AgentCard.test.tsx
│   │           ├── index.ts
│   │           ├── constants.ts
│   │           ├── helpers.ts
│   │           └── styles.ts
│   │
│   └── repos/[repoId]/pulls/[number]/   # deep dynamic route
│       ├── page.tsx                     # thin
│       ├── constants.ts                 # route-level shared consts (optional)
│       ├── helpers.ts                   # route-level shared helpers (optional)
│       └── _components/…                # the screen's features
│
├── components/                       # CROSS-ROUTE shared components
│   ├── app-shell/                    # nav, breadcrumbs, shortcuts (app chrome)
│   ├── page-shell/                   # standard page frame
│   ├── diff-viewer/                  # reused on multiple screens
│   └── <Widget>/                     # same folder anatomy as route components
│
├── lib/                              # NON-VISUAL app logic
│   ├── api.ts                        # single network client (baseURL, fetch wrapper)
│   ├── hooks/                        # TanStack Query hooks — ALL data access
│   │   ├── core.ts                   # useApiQuery/useApiMutation building blocks
│   │   ├── agents.ts                 # useAgents, useCreateAgent, useDeleteAgent…
│   │   └── reviews.ts
│   ├── providers.tsx                 # QueryClientProvider etc. (mounted in layout)
│   ├── theme.tsx / toast.tsx         # cross-cutting context providers
│   ├── format-cost.ts (+ .test.ts)   # pure, app-wide utilities
│   └── types.ts                      # cross-cutting local types (non-contract)
│
├── vendor/
│   ├── ui/                           # design system → barrel `@devdigest/ui`
│   └── shared/                       # Zod contracts → `@devdigest/shared`
│
├── i18n/                             # next-intl config
├── messages/<locale>/*.json          # translated strings (no inline UI literals)
└── test/                             # shared vitest setup
```

## The three layers, restated

1. **Routing (`app/`)** — URL → screen mapping. Thin `page.tsx`, `layout.tsx`, route
   special files (`loading`, `error`, `not-found`). Feature UI is colocated in
   `_components/`, never written inline in the page.
2. **Presentation (`components/` + route `_components/`)** — what the user sees. Dumb
   about the network; receives data via props or via a hook it calls.
3. **Logic (`lib/`)** — data access (`api.ts` + `hooks/`), providers, pure utilities,
   cross-cutting types. The only layer allowed to know about the network and the server
   contracts.

## Decision tree: where does a new piece of code go?

```
Is it a ROUTE (has a URL)?
│  yes → app/<segment>/page.tsx   (keep it thin — delegate to a _components view)
│  no ↓
Is it VISUAL (renders JSX)?
│  yes → Is it used by more than one route TODAY?
│  │      yes → src/components/<Name>/
│  │      no  → app/<route>/_components/<Name>/   (colocate; promote later if reused)
│  no ↓
Does it FETCH data or mutate the server?
│  yes → src/lib/hooks/<domain>.ts   (network detail stays in src/lib/api.ts)
│  no ↓
Is it a PURE function (no state, no I/O)?
│  yes → used by one component? → <Name>/helpers.ts
│        used app-wide?          → src/lib/<name>.ts
│  no ↓
Is it a CONSTANT / lookup table?
│  yes → local? → <Name>/constants.ts    app-wide? → src/lib/<name>.ts
│  no ↓
Is it a TYPE?
│  server response/domain shape → import from @devdigest/shared (never redefine)
│  local view/prop type          → inline in the .tsx, or <Name>/types.ts if reused
│  no ↓
Is it STYLING?
│  component-specific → <Name>/styles.ts       reusable primitive → vendor/ui
│  no ↓
Is it a USER-FACING STRING? → messages/<locale>/*.json  (never a literal in JSX)
```

## Component vs. view vs. widget — a vocabulary

- **Page** (`page.tsx`) — route entry. One import, one render. Thin.
- **View** — the top feature component for a screen (`AgentsListView`,
  `PrDetailView`). Owns the screen's layout and orchestrates hooks + sub-components.
- **Feature component** — a meaningful chunk within a view (`AgentCard`, `FindingCard`,
  `RunTraceDrawer`). Colocated under the view's `_components/`.
- **Shared component / widget** — used by ≥2 routes → `src/components/`.
- **Primitive** — Button/Badge/Icon from the design system (`@devdigest/ui`).

## Rules that keep the graph clean

- **No sideways imports.** Route A's `_components` must never import route B's
  `_components`. Shared code goes up to `components/`/`lib/`.
- **No upward imports.** `lib/` and `components/` never import from `app/**/_components`.
- **One entry to the network.** Only `lib/api.ts` performs fetches; only `lib/hooks/*`
  call `api.ts`; components call hooks. This keeps caching, auth, and error handling
  in one place and components trivially testable (mock the hook).
- **Contracts are single-source.** Response types come from `@devdigest/shared`; never
  hand-redeclare a shape the server already owns.

## When a component folder grows too big

- `.tsx` over ~200 lines → extract sub-components into `_components/`.
- Repeated inline arrays/objects → `constants.ts`.
- Any logic you'd want to unit-test → `helpers.ts` (+ `helpers.test.ts`).
- Stateful/effectful logic reused across sub-components → a local hook, or `lib/hooks`
  if it touches the network.

See [examples.md](examples.md) for concrete good/bad versions of each of these moves.
