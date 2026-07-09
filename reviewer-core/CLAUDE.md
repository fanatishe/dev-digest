# CLAUDE.md — reviewer-core (`@devdigest/reviewer-core`)

The pure review engine: **diff → prompt → LLM → grounded findings.** Read
`../CLAUDE.md` first. Map, not docs — keep ≤100 lines; link, don't copy.

## Commands

- `npm test` (vitest — hermetic, stubbed `LLMProvider`, no keys/network)
- `npm run typecheck` — **this is the build**; the package never emits JS.

## Conventions (non-default)

- **Purity is the contract.** No DB, GitHub, or filesystem. The only side effect is
  an LLM call through an **injected `LLMProvider`** — that's what makes it
  mock-testable. Do not add I/O; take inputs as arguments, return data.
- **Consumed as TS source** via the server's tsconfig path alias (tsx in dev, vitest
  in tests). No dist. The same engine is reused unchanged by the CI runner (L06).
- **Contracts come from `@devdigest/shared`** (`Review`, `Finding`, `Verdict`). The
  output schema is enforced **out of band** (`response_format: json_schema, strict`),
  NOT described in the prompt — never restate the JSON shape in prose.
- **Grounding is mandatory** (`grounding.ts`): a finding not citing a real diff line
  is dropped. **Score is recomputed** deterministically from survivors — the model's
  self-reported score is ignored. (Verdict is currently passed through as-is.)
- **`INJECTION_GUARD`** is appended to every agent's system prompt by `assemblePrompt`.
  Untrusted content is fenced `<untrusted>`; we do NOT keyword-scan it.
- Optional prompt slots (`skills`, `memory`, `specs`, `callers`) are omitted in the
  starter — `assemblePrompt` simply leaves those sections out. Lessons feed them.

## Read when

- The pipeline & public API → `README.md`
- Pipeline / grounding / structured-output internals → `docs/`
- Engine output invariants (grounding, score formula, guard) → `specs/`
- How an agent prompt becomes messages → `../docs/agent-prompts/README.md`
- A review output looks wrong → `INSIGHTS.md`
