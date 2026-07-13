# CLAUDE.md — server (`@devdigest/api`)

Fastify 5 + Drizzle/Postgres API: imports repos & PRs, indexes repos (`repo-intel`),
stores agents, runs the reviewer (`reviewer-core`). Read `../CLAUDE.md` first for
repo-wide rules. Map, not docs — keep ≤100 lines; link, don't copy.

## Commands

- `pnpm dev` (`:3001`) · `pnpm typecheck` · `pnpm build` (tsc)
- `pnpm db:migrate` (**required — not run on boot**) · `pnpm db:seed` (idempotent)
- `pnpm db:generate` (after editing `db/schema/*`)
- Tests split by filename: `pnpm exec vitest run --exclude '**/*.it.test.ts'` (unit,
  no Docker) · `pnpm exec vitest run .it.test` (integration, real Postgres) · `pnpm test` (both)

## Conventions (non-default)

- **Adapters go through the DI container** (`platform/container.ts`) — never `new` an
  LLM/GitHub/git client in a module. Tests inject mocks via `ContainerOverrides`
  (`src/adapters/mocks.ts`). Services depend on the interface, not the concrete class.
- **Add a module** = create `modules/<name>/routes.ts` (default Fastify plugin) + one
  import/entry in `modules/index.ts`. Static registration only (no fs autoload).
- **Routes are schema-first.** Declare Zod `params`/`body`; invalid input → 422 before
  the handler. Don't hand-roll `Schema.parse(req.body)`. One Zod contract drives
  validation *and* response serialization (`fastify-type-provider-zod`).
- **Plugins register before modules** (helmet, cors, rate-limit, SSE, error handler)
  so encapsulated module plugins inherit them.
- **`*.it.test.ts` = DB-backed** (imports `test/helpers/pg.ts`). Any DB test MUST use
  that suffix or the unit/integration split breaks.
- **`server/clones/`** is runtime git checkouts (git-ignored) — not source, not tested.

## Gotchas / do-not-touch

- **Don't edit the shared tables' migrations** — the schema is complete by design;
  add new tables/columns via new migrations only (see root CLAUDE.md).
- Rate limit is global 120/min (off under `NODE_ENV=test`); SSE + `/health*` exempt.
- Secrets are **not** part of `AppConfig` — they flow through `SecretsProvider`.

## repo-intel (subsystem, `src/modules/repo-intel/`)

Indexes a clone once (symbols · import graph · PageRank · cached repo map). On a
review it is **read-only**. Everything downstream reads the **facade** (`repoIntel.*`
in `service.ts`) — never the pipeline internals. Unindexed repos degrade to empty
results, not errors. Its own README is the SoT: `src/modules/repo-intel/README.md`.

## Read when

- The full API/DI/request map → `README.md`
- Changing the DB schema → `docs/` (+ `../CLAUDE.md` extend-don't-migrate rule)
- Adding/altering a route or its contract → `specs/` + `src/vendor/shared/contracts/`
- Touching repo-intel → `src/modules/repo-intel/README.md`
- Review-context assembly (repo map → prompt) → `modules/reviews/run-executor.ts` + `../reviewer-core/CLAUDE.md`
- A surprising behavior before debugging → `INSIGHTS.md`
