# Enforcement — the mechanical boundary check

The skill ships a `dependency-cruiser` ruleset at
[`../assets/onion.dependency-cruiser.cjs`](../assets/onion.dependency-cruiser.cjs)
that turns the dependency-inward rule into failing lint errors. `dependency-cruiser`
is **already a `server` dependency (`^17.4.3`)** — no install is required.

## Run it

Run from a **package directory** so the local `./tsconfig.json` (and its
`@devdigest/*` path aliases + `.js`→`.ts` resolution) is picked up:

```bash
# server (@devdigest/api)
cd server
pnpm exec depcruise --config ../.claude/skills/onion-architecture/assets/onion.dependency-cruiser.cjs src

# reviewer-core (purity check)
cd reviewer-core
pnpm exec depcruise --config ../.claude/skills/onion-architecture/assets/onion.dependency-cruiser.cjs src
```

A conforming tree prints `no dependency violations found`.

### Current baseline (first run, unrefactored tree)

- **`reviewer-core`** — ✅ clean (0 violations). The pure core already conforms.
- **`server`** — surfaces **8 `routes-no-db` errors** in four thin CRUD modules
  that query Drizzle directly from `routes.ts` with no service/repository:
  `modules/{workspace,settings,pulls,polling}/routes.ts`. These are genuine onion
  deviations, not false positives — the fix is to add a `service.ts` +
  `repository.ts` per the [layers](layers.md) model (as `repos`/`reviews`/`agents`
  already do). Until then, `arch:check` is expected to fail on `server`; treat the
  list as the adopt-and-fix backlog. A few `no-circular` **warnings** (the
  `Container` ↔ `repo-intel` composition-root cycle, `agents` helpers↔repository)
  are advisory.

Add a shortcut to `server/package.json`:

```jsonc
"scripts": {
  "arch:check": "depcruise --config ../.claude/skills/onion-architecture/assets/onion.dependency-cruiser.cjs src"
}
```

## What the rules encode

| Rule | Fails when… | Severity |
|---|---|---|
| `routes-no-db` | a `modules/*/routes.ts` imports `drizzle-orm`/`postgres`/`db/client`/`db/schema` | error |
| `routes-no-external-sdk` | a route imports `openai`/`@anthropic-ai`/`octokit`/`simple-git` | error |
| `service-no-fastify` | a `service.ts` imports Fastify or a `@fastify/*` plugin | error |
| `service-no-db-driver` | a `service.ts` imports `drizzle-orm`/`postgres` directly (bypasses repo) | error |
| `service-no-external-sdk` | a `service.ts` constructs an SDK instead of resolving via the container | error |
| `helpers-must-stay-pure` | a `helpers.ts`/`constants.ts` imports Fastify/DB/SDK | error |
| `adapters-no-transport` | an `adapters/**` file imports a route or Fastify | error |
| `core-purity-no-io` | `reviewer-core` imports `postgres`/`drizzle`/`octokit`/`simple-git`/`fastify`/`fs` | error |
| `core-no-server` | `reviewer-core` imports the `server` package | error |
| `no-circular` | any import cycle exists | warn |

## Reading a violation

`dependency-cruiser` prints `error <rule-name>: <from> → <to>`. Map it back:

- `error routes-no-db: src/modules/x/routes.ts → node_modules/drizzle-orm/...` —
  move the query into `modules/x/repository.ts`, call it from `service.ts`, and
  have the route call the service.
- `error core-purity-no-io: src/review/run.ts → node_modules/postgres/...` — the
  core is reaching for I/O; pass the data in as an argument and let the **caller**
  (server/runner) do the persistence.

## Adding a new allowed ring or exception

1. Prefer restructuring the code to fit an existing ring — a new exception usually
   means the code is in the wrong file.
2. If a genuine new boundary is needed, add a `forbidden` rule (deny-by-intent) or
   narrow an existing one's `pathNot`. Keep rule `name`s descriptive; they appear
   verbatim in CI output.
3. Update [`layers.md`](layers.md) and [`tools.md`](tools.md) so the docs and the
   machine check never drift.

## CI wiring

Run `arch:check` as a job step alongside `pnpm typecheck`. The existing test split
(`*.it.test.ts` = DB-backed) is unaffected — the ruleset excludes test files
(`options.exclude`). Treat `error`-severity violations as build-breaking; `warn`
(cycles) as advisory until burned down.

> Tooling note: `eslint-plugin-boundaries` was evaluated for in-editor red
> underlines but **not** adopted — `dependency-cruiser` is already installed, so we
> avoid a new dependency. Revisit if the team wants live editor feedback.
