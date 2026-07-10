---
name: onion-architecture
description: >-
  Enforces Onion (Ports-and-Adapters / Clean) architecture for the DevDigest
  backend packages — `server` (@devdigest/api) and `reviewer-core`. Use when
  adding or editing anything under `server/src/**` or `reviewer-core/src/**`:
  a module's routes/service/repository, an adapter, the DI container, a Drizzle
  schema, or the pure review engine. Answers "where does this code go?", states
  the dependency-inward rule and which tool is allowed in which layer, and ships
  a dependency-cruiser ruleset that mechanically fails on boundary violations.
  Trigger terms: onion architecture, clean architecture, hexagonal, ports and
  adapters, layer, boundary, dependency rule, routes, service, repository,
  adapter, container, DI, reviewer-core.
metadata:
  tags: architecture, onion, clean-architecture, hexagonal, backend, fastify, drizzle, dependency-cruiser
---

# Onion Architecture (DevDigest backend)

The DevDigest backend already follows Onion architecture — this skill makes it
**explicit and enforceable**. Dependencies point **inward only**: outer rings may
import inner rings; an inner ring must **never** import an outer one. The core
holds business rules and knows nothing about Fastify, Drizzle, Postgres, GitHub,
or the filesystem; those live in the outer rings and are wired in at the
composition root (`server/src/platform/container.ts`).

> This SKILL.md is the map. Detail lives in [`references/layers.md`](references/layers.md),
> [`references/tools.md`](references/tools.md), [`references/enforcement.md`](references/enforcement.md),
> good/bad code in [`examples.md`](examples.md), and sources in [`references.md`](references.md).

## When to use

Read this **before**:
- Adding a module (`modules/<name>/routes.ts` + `service.ts` + `repository.ts`).
- Adding or changing an **adapter** (`adapters/**`) or wiring it in the `Container`.
- Editing a Drizzle **schema** (`db/schema/**`) or a repository query.
- Touching **`reviewer-core`** — the pure domain core (purity is its contract).
- Reviewing a diff for layer/boundary violations, or running `arch:check`.

## The layers (mapped onto existing folders — no renames)

Rings from **innermost (pure) → outermost (I/O)**. Each ring may import only the
rings **above it in this table**.

| Ring (inner→outer) | Lives in | May use | Must NOT import |
|---|---|---|---|
| **Domain core** (pure) | `reviewer-core/src/**`; `modules/*/helpers.ts`, `modules/*/constants.ts`; row types via `db/rows.ts` | Zod (types), pure TS | Fastify, Drizzle, `postgres`, `octokit`, `simple-git`, fs, any adapter |
| **Ports / contracts** | `@devdigest/shared` (`vendor/shared`) — `LLMProvider`, `GitClient`, `Repo`, `Review`, … | Zod | any concrete adapter impl |
| **Application / use-cases** | `modules/*/service.ts`, `reviews/run-executor.ts`, `platform/jobs.ts`, `platform/model-router.ts` | ports + domain; adapters **via the DI `Container`** | Fastify `Request`/`Reply`; direct `drizzle`/`postgres` |
| **Infrastructure / adapters** | `adapters/**`, `modules/*/repository.ts` (+ `repository/*.repo.ts`), `db/client.ts`, `platform/container.ts` | Drizzle, `postgres`, LLM SDKs, `octokit`, `simple-git`, ripgrep, ast-grep | Fastify route/HTTP concerns |
| **HTTP / transport** (outermost) | `modules/*/routes.ts`, `app.ts`, `server.ts` | Fastify + `fastify-type-provider-zod` + plugins | Drizzle / `postgres` / LLM SDKs **directly** |

Full per-ring detail and rationale: [`references/layers.md`](references/layers.md).
Which tool belongs to which ring: [`references/tools.md`](references/tools.md).

## Core invariants

1. **Dependency rule** — imports go inward only. The `Container`
   (`platform/container.ts`) is the single composition root that wires
   outer→inner; nothing else may `new` an adapter.
2. **`reviewer-core` is the pure core** — zero I/O except the **injected**
   `LLMProvider`. No DB, GitHub, or fs. Consumed as TS source (no dist).
3. **Tool-per-ring** — Fastify only in `routes.ts`/`app.ts`; Drizzle/`postgres`
   only in `repository.ts`/`db`; external SDKs only under `adapters/`; Zod
   contracts (`@devdigest/shared`) are the shared language that crosses rings.
4. **Depend on interfaces, not implementations** — modules receive adapters from
   the container (`container.git`, `await container.llm('openai')`), never
   construct them. Tests inject mocks via `ContainerOverrides`.

## "Where does this code go?" checklist

- Parses an HTTP request / sets a status code / declares a Zod `body`/`params`? →
  **`routes.ts`** (HTTP ring). Then immediately delegate to a service.
- Orchestrates a use-case, enqueues a job, coordinates repos/adapters? →
  **`service.ts`** (application ring).
- Runs a SQL/Drizzle query or maps rows? → **`repository.ts`** (infra ring).
- Talks to an external system (LLM, GitHub, git, embeddings, ripgrep)? →
  **`adapters/**`** behind a `@devdigest/shared` interface, wired in the container.
- Pure transform / DTO / constant, no I/O? → **`helpers.ts` / `constants.ts`**.
- Pure review logic (diff→prompt→LLM→grounded findings)? → **`reviewer-core`**,
  taking inputs as arguments and returning data.

## Enforce it (mechanical check)

`dependency-cruiser` is **already a `server` dependency** — no install needed. The
ruleset encoding the forbidden inward-rule edges ships with this skill at
[`assets/onion.dependency-cruiser.cjs`](assets/onion.dependency-cruiser.cjs).

Run from `server/`:

```bash
pnpm exec depcruise --config ../.claude/skills/onion-architecture/assets/onion.dependency-cruiser.cjs src
```

`reviewer-core` is already clean; `server` currently reports **8 `routes-no-db`
errors** in four thin CRUD modules (`workspace`, `settings`, `pulls`, `polling`)
that query Drizzle straight from `routes.ts` — genuine onion deviations that form
the adopt-and-fix backlog. To wire a shortcut, add `"arch:check"` to
`server/package.json` scripts (note: that file is `skip-worktree`, so add it
locally / in CI rather than expecting `git status` to track it). See
[`references/enforcement.md`](references/enforcement.md) for the baseline, how to
read a violation, add a new allowed ring, and wire CI.

## Related skills

- [`fastify-best-practices`](../fastify-best-practices/SKILL.md) — HTTP ring internals.
- [`drizzle-orm-patterns`](../drizzle-orm-patterns/SKILL.md) — infra/repository ring.
- [`zod`](../zod/SKILL.md) — the contracts that cross rings.
- Module maps: `server/CLAUDE.md`, `reviewer-core/CLAUDE.md`.
