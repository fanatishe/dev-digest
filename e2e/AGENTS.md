# CLAUDE.md — e2e (`@devdigest/e2e`)

Deterministic browser flows for the web app, driven by Vercel **agent-browser**
(Rust+CDP). No Playwright, no LLM, no API key. Read `../CLAUDE.md` first. Map, not
docs — keep ≤100 lines; link, don't copy.

## Commands

- `./scripts/e2e.sh` (from repo root) — **hermetic**: isolated freshly-seeded stack
  on alt ports (PG :5433, API :3101, web :3100), runs flows, tears down. Preferred.
- `npm i -g agent-browser && agent-browser install` (one-time; downloads Chrome).
- `cd e2e && npm test` — runs against a stack you already booted (see gotcha below).

## Conventions (non-default)

- **A flow is a JSON list of agent-browser commands** (`specs/NN-name.flow.json`),
  run in order against one shared session by `run.ts`. `{BASE}` → `E2E_BASE_URL`.
- **Deterministic locators only** (`--url`, `--text`, `find role|text|label`).
  **Never the AI `chat` command** — that's what keeps runs stable and key-free.
- **`wait --text` / `wait --url` ARE the assertions** — they exit non-zero on timeout.
  Optional `"assert": { "stdoutIncludes": "…" }` adds a substring check.
- Flows target **read-only seeded data** (demo repo `acme/payments-api`, PR #482) so
  nothing triggers a model call.
- **`specs/` here holds test flows, not doc-specs.** This module has no doc `specs/`
  folder — engine/design notes go in `docs/`.

## Gotchas / do-not-touch

- **Never `docker compose down -v`** to reset your dev DB — `-v` deletes every
  imported repo/review. The hermetic runner exists precisely to avoid this.
- Flows 02/04/05 assume the seeded repo is the **only** repo (they follow the home
  redirect to the first one). Run hermetic, not against a populated dev DB.

## Read when

- How flows/`run.ts` work + full coverage table → `README.md`
- Runner/hermetic-stack design & env knobs → `docs/`
- A flow is flaky or fails to locate an element → `INSIGHTS.md`
