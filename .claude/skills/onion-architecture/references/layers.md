# Layers in depth

Onion architecture (Jeffrey Palermo, 2008) controls coupling by arranging code in
concentric rings and enforcing one rule: **all dependencies point inward.** An
outer ring may import an inner ring; an inner ring must never import an outer one.
Below, each ring is mapped onto the folders that already exist in `server/src` and
`reviewer-core/src` — we label what is there, we do not rename it.

Import direction (allowed): `HTTP → Application → Ports → Domain core`, and
`Infrastructure → Ports → Domain core`. The composition root (`Container`) is the
one place allowed to reach across from an outer ring to construct inner-facing
adapters.

---

## 1. Domain core (innermost, pure)

**Lives in:** `reviewer-core/src/**`; the pure files of a module —
`modules/*/helpers.ts`, `modules/*/constants.ts`; row/domain types surfaced via
`db/rows.ts` (types only, not the client).

**Responsibility:** business rules and pure transforms. In DevDigest the flagship
core is `reviewer-core`: `diff → prompt → LLM → grounded findings`. It performs no
I/O — its only side effect is a call through an **injected** `LLMProvider`
(`reviewer-core/src/review/run.ts`). Score recomputation, grounding, prompt
assembly, and diff slicing are all pure.

**May import:** Zod (for type shapes), `@devdigest/shared` contracts, other pure
core. Nothing else.

**Must NOT import:** Fastify, Drizzle, `postgres`, `octokit`, `simple-git`, `fs`,
anything under `adapters/`, or a module's `routes.ts`/`repository.ts`.

**Why:** purity is what makes the engine mock-testable and reusable unchanged by
the CI runner (no dist, consumed as TS source). See `reviewer-core/CLAUDE.md` and
`reviewer-core/specs/`.

---

## 2. Ports / contracts

**Lives in:** `@devdigest/shared` (vendored at `server/src/vendor/shared`) —
interfaces like `LLMProvider`, `GitClient`, `GitHubClient`, `CodeIndex`,
`Embedder`, `SecretsProvider`, `AuthProvider`, and the Zod data contracts (`Repo`,
`Review`, `Finding`, `Verdict`, …).

**Responsibility:** the shared vocabulary every ring agrees on. Ports are the
seams that let the application ring depend on an **interface** while the concrete
implementation lives further out. This is the dependency-inversion hinge of the
onion.

**May import:** Zod. **Must NOT import:** any concrete adapter implementation.

---

## 3. Application / use-cases

**Lives in:** `modules/*/service.ts`, `modules/reviews/run-executor.ts`,
`platform/jobs.ts`, `platform/model-router.ts`.

**Responsibility:** orchestrate a use-case — coordinate repositories and adapters,
enqueue jobs, run transactions, call the domain core. Example:
`RepoService` (`modules/repos/service.ts`) does add/list/refresh/remove and owns
the async `clone` job; it holds a `Container` and a `RepoRepository`, and states
in its own header: "No HTTP and no raw SQL live here."

**May import:** ports + domain core; adapters **resolved through the DI
`Container`** (`container.git`, `await container.llm('openai')`,
`container.reviewRepo`).

**Must NOT import:** Fastify request/reply types or route concerns; must not run
raw SQL or `new` an adapter directly.

---

## 4. Infrastructure / adapters

**Lives in:** `adapters/**` (LLM, GitHub, git, codeindex, embedder, secrets,
tokenizer, depgraph), `modules/*/repository.ts` (+ `repository/*.repo.ts`),
`db/client.ts`, and the composition root `platform/container.ts`.

**Responsibility:** implement the ports against real systems. Repositories run
Drizzle/`postgres` and map rows; adapters wrap `octokit`, `simple-git`, the LLM
SDKs, ripgrep, and ast-grep. The `Container` lazily constructs and caches these,
and is the **only** place that instantiates them.

**May import:** Drizzle, `postgres`, external SDKs, plus ports and domain core.

**Must NOT import:** a module's `routes.ts` or HTTP/Fastify concerns (an adapter
depending on the transport ring would invert the arrow).

---

## 5. HTTP / transport (outermost)

**Lives in:** `modules/*/routes.ts`, `app.ts`, `server.ts`.

**Responsibility:** parse the request, validate with a Zod `body`/`params` schema
(one contract drives validation **and** serialization via
`fastify-type-provider-zod`), map status codes, and **delegate** to a service.
Routes are thin: `modules/repos/routes.ts` extracts context and immediately calls
`service.add/list/refresh/remove`.

**May import:** Fastify + `@fastify/*` plugins + `fastify-type-provider-zod`, and
the module's own service.

**Must NOT import:** Drizzle, `postgres`, or an LLM/GitHub SDK **directly** — those
belong to inner rings reached via the service.

---

## Cross-references

- `server/CLAUDE.md` — "Adapters go through the DI container", schema-first routes,
  module registration, test split.
- `reviewer-core/CLAUDE.md` — "Purity is the contract".
- `server/docs/` (DI container, schema) and `reviewer-core/docs/` (pipeline,
  grounding) — design source-of-truth.
- Tool→ring map: [`tools.md`](tools.md). Enforcement: [`enforcement.md`](enforcement.md).
