# INSIGHTS — mcp (`@devdigest/mcp`)

Append-only engineering insights for this module. Read before you write; add only
significant, non-obvious learnings. See `../.claude/skills/engineering-insights/SKILL.md`
for the rubric.

## What Works
<!-- Approaches, patterns, and solutions that proved effective. problem → what to do. -->

- **Give the MCP server the same rings the API has.** The naive design has the tool
  handler call the HTTP client — which collapses four rings into one and reproduces the
  repo's known `routes-no-db` sin in a brand-new package. Tools stay thin (schema → one
  service call → format); `ports.ts` declares `ApiPort`; `index.ts` is the only place
  that `new`s the client. The payoff is immediate: services and `resolve.ts` are tested
  against a **plain mock object**, with no `fetch` stubbing and no MCP SDK in the loop.
- **Cache in the adapter, not the service.** `GET /repos/:id/pulls` syncs from GitHub
  *and* enqueues a billable intent job, so resolving a PR twice in one tool call costs
  money. A 60s TTL cache in `api/http-client.ts` fixes it once for every caller;
  putting it in a service would have to be re-done per service.
- **"Errors lead onward" has a MONEY AXIS — an onward message can reverse another
  tool's guardrail.** `get_findings` reached with the `run_id` of a *timed-out* run
  finds no review. The obvious fallback — `noCompletedReviewMessage` ("no review yet,
  call run_agent_on_pr") — **contradicts the timeout message that same run just issued**
  ("Do NOT call run_agent_on_pr again") and bills the user a second time for a review
  already in flight. `ReviewService.missingRunMessage()` therefore spends one free
  `listRuns()` GET to disambiguate: still-running → `runStillRunningMessage`, terminal →
  `runFailedMessage`, unknown → the run-one pointer. **Before writing any onward
  message, ask which tool it points at and what that tool costs.**
- **`isError` is a billing decision, not a truth decision.** `get_blast_radius` returns
  `isError: true` (free, deterministic, a retry costs nothing). `run_agent_on_pr`'s
  timeout returns `isError: false` (the model call is already billed; an error result
  invites the host to retry, and a retry is a second bill). Same package, opposite
  flags. The deciding question is *"could a retry of this call cost the user money?"* —
  not *"did something go wrong?"*
- **A `kind: 'summary'` fixture is what makes the review filter real.** `ReviewRecord.kind`
  is `'summary' | 'review'` and the API is newest-first, so a summary row sits at `[0]`.
  Seed one with the *same* `run_id` as the review: deleting `filter(r => r.kind ===
  'review')` then fails **6 tests**. Without that fixture the filter is decorative and
  the bug ships green.
- **A tool handler is testable without an MCP server.** Pass a capture-only
  `{ registerTool }` object cast to `McpServer`, grab the captured config + handler, and
  call the handler directly over a mock `ApiPort`. You get regression tests on the
  **frozen contract** (`inputSchema` keys, `readOnlyHint`, the description clause) *and*
  on the handler body — no transport, no client, no `fetch`.
- **A JSON-RPC smoke test needs no inspector.** Pipe four lines of NDJSON
  (`initialize`, `notifications/initialized`, `tools/list`, `tools/call`) into
  `tsx src/index.ts`. This proves registration **and** call-time schema validity in one
  shot — and `tools/call` is essential, because the raw-shape `inputSchema` bug fails at
  call time, which `tools/list` alone would never surface.

- **dependency-cruiser reasons about import EDGES, so the two rules this package needs
  most are invisible to it — they are GLOBALS.** `fetch()` and `process.env` have no
  import to cruise, and neither does `console.log`. So a `fetch()` added to `format.ts`,
  or a `console.log` that corrupts the JSON-RPC frame, passes `npm run arch:check` **green**
  — while `arch:check` is the very thing `docs/design.md` cited as proof of "domain purity:
  no fetch, no env". The fix is a second, dumber check: `scripts/purity-check.mjs`
  (`npm run purity:check`) greps production files for stdout writes and the domain ring
  (`format`/`errors`/`schemas`) for I/O globals, strips comments first so a rule *named* in
  a comment is not a violation, and runs in CI beside `arch:check`. Generalise: when a
  boundary rule is about a **global** rather than an **import**, a dependency cruiser can
  never enforce it — write the grep. (2026-07-14)

## What Doesn't Work
<!-- Dead ends and antipatterns. The most valuable section — don't skip it. -->

- **A doc that says "CI greps for it" is worthless if CI does not — and this package shipped
  exactly that lie for a day.** `AGENTS.md` and this file both claimed *"CI greps `mcp/src`
  for [`console.log`]"*. It did not: `.github/workflows/mcp.yml` ran `npm ci` → `tsc` →
  `vitest` and **nothing else** — no grep, and no `arch:check` either. Both checks existed
  only inside `./scripts/mcp.sh check`, a script a human has to *remember* to run. So the
  package's single most dangerous failure mode (one stray `console.log` → corrupted frame →
  the host reports only an unreadable *"failed to connect"*) and its whole onion boundary
  were guarded by nothing automatic, while three separate documents asserted they were.
  A check that lives only in a dev script is **documentation, not enforcement**. If a doc
  claims CI enforces something, open the workflow and confirm it — and when adding a check,
  the last step is always wiring it into CI. (2026-07-14)

- **Do NOT copy `reviewer-core`'s `"zod": ["./node_modules/zod"]` tsconfig path
  mapping into this package.** It bypasses zod's package `exports`, so the MCP SDK's
  `zod/v3` and `zod/v4/core` **type subpaths** no longer resolve — and every
  `registerTool()` call then fails with `TS2589: Type instantiation is excessively deep
  and possibly infinite`, after a ~20s typecheck. Deleting the two `zod` path entries
  takes the typecheck from 21s+fail to 2.9s+clean. mcp doesn't need the mapping anyway:
  it imports `@devdigest/shared` as **types only**, so the two zod copies never meet.
- **`inputSchema: z.object({...})` is the classic SDK-v1 bug.** It must be a RAW ZOD
  SHAPE (`{ repo: repoArg }`). Wrapping it type-checks and registers fine, then
  produces a broken JSON Schema that fails at **call** time — the worst place to find out.
- **Never `console.log` in this package.** stdout is the JSON-RPC frame; one stray
  write corrupts it and the host reports an opaque parse error, nowhere near the cause.
  All logging goes to **stderr** (`console.error`). CI greps `mcp/src` for it.
- **Returning `structuredContent` without declaring an `outputSchema` FAILS SILENTLY.**
  It does not throw — verified live against SDK 1.29, the call succeeds and the payload
  is delivered. But nothing declares its shape, so a host cannot validate it and is free
  to ignore it. `run_agent_on_pr` and `get_findings` shipped this way and the unit tests
  never noticed, because the tests call the handler directly and never see the schema.
  **If a handler emits `structuredContent`, its registration MUST declare an
  `outputSchema`** (a raw shape, like `inputSchema`). Only the stub is exempt — it emits
  no structured content.
- **`.catch()` does not catch a SYNCHRONOUS throw.** `callApi` in `catalog.service.ts`
  was briefly rewritten from `try { await call() } catch` to `return call().catch(...)`.
  A `.catch()` handler only ever sees a *rejected promise*; a mock (or a real adapter)
  that throws synchronously escapes it unwrapped, and the model gets a raw
  `ApiUnreachableError` instead of the "start it with ./scripts/dev.sh" message. Keep
  the `try/await/catch` form in any wrapper that normalizes errors.
- **A truncation hint must count the FILTERED total.** `get_conventions` with
  `accepted_only: true` + `limit` would otherwise promise "N more" rows the filter had
  already removed — a lie that costs the model a wasted call.

## Codebase Patterns
<!-- Project conventions, architecture and naming decisions specific to this module. -->

- **A config INTERFACE belongs in the ports ring; only the config LOADER is
  infrastructure.** `McpConfig` originally lived in `config.ts` — the infra file that reads
  `process.env` — so `services/{review,catalog}.service.ts` imported it from there, i.e. the
  application ring pointed **outward** at infrastructure, the one direction the onion
  forbids. It was type-only and therefore harmless at runtime, which is exactly why it
  survived review and why depcruise had no rule against it. Fix: the `McpConfig` interface
  now lives in `ports.ts` (next to `ApiPort` — it is the same kind of thing: a shape the
  application programs against), `config.ts` *imports* it and returns it, and
  `app-depends-on-port-not-impl` now forbids `services/** → config.ts` as well as
  `→ api/**`, so the regression is caught mechanically. Rule of thumb: if a service needs
  it, it is a **port**, not infrastructure — no matter which file happens to build it.
  (2026-07-14)

- Rings: domain (`format`/`errors`/`schemas`, pure) → ports (`ports.ts`/`types.ts`) →
  application (`services/*`, `resolve.ts`, `wait.ts`) → infrastructure
  (`api/http-client.ts`, `config.ts`) → transport (`index.ts`, `tools/*`).
  `.dependency-cruiser.cjs` encodes it; `npm run arch:check` fails the build on a breach.
- **Errors lead onward.** Every message in `errors.ts` names the next tool or command;
  `errors.test.ts` asserts every one of them matches
  `/list_agents|get_findings|run_agent_on_pr|get_conventions|dev\.sh|DevDigest UI/`.
- **Nothing raw goes on the wire.** `format.ts` projects records (drops `system_prompt`,
  `id`, `review_id`; folds `start_line`/`end_line` into `lines`; truncates snippets).
  The `content` text block is a markdown summary — never `JSON.stringify` of the
  `structuredContent`, which would bill the same payload twice.
- **`ProjectedFinding` is concise-plus-optionals, NOT `z.union([Concise, Full])`.** A
  union renders as `anyOf` in the JSON Schema — bigger in the host's context (schema
  tokens are rent, paid on every chat start) and harder for a model to read. One object
  with three optional fields (`confidence`/`rationale`/`suggestion`) covers both `detail`
  levels.
- **A stub's *registration* is the deliverable; its handler is scaffolding.** Freezing
  `get_blast_radius`'s real `inputSchema` (`{repo, pr}`) and asserting the keys in a test
  is what makes finishing it a one-function change. The arguments are what every future
  caller and doc example depends on — and the part most likely to get "helpfully" tweaked
  while the tool does nothing.
- **A CI path filter is a type-graph fact, not a folder name.** `mcp.yml` filters on
  `server/src/vendor/shared/**` as well as `mcp/**`, because a tsconfig `paths` alias
  makes that directory a type-check *input* for a package that does not contain it (the
  same reason `reviewer-core.yml` does). In an aliases-not-packages repo the rule
  generalises: **every tsconfig `paths` entry pointing outside the package is a required
  second path filter**, or a shared-contract edit breaks a downstream typecheck silently,
  on someone else's PR.

## Tool & Library Notes
<!-- Quirks and gotchas of dependencies/tooling. -->

- `@modelcontextprotocol/sdk@1.29`: use `server.registerTool(name, config, handler)`.
  `server.tool()` is `@deprecated`. The SDK's types are zod-3-and-4 compatible via
  `zod/v3` + `zod/v4/core` subpath imports — which is exactly what the tsconfig `paths`
  trap above breaks.
- The package uses **npm + `package-lock.json`** (like `e2e` and `reviewer-core`); only
  `server`/`client` use pnpm.
- **`structuredContent` is typed `Record<string, unknown>`, and a TS `interface` will
  not assign to it** — interfaces carry no implicit index signature. `structuredContent:
  result` fails to compile where `structuredContent: { ...result }` (an anonymous object
  type) succeeds. Spread it.
- **A fake `sleep` freezes the clock, so a poll loop must not read one.** `waitForRun`
  accumulates elapsed time from the delays it *requests*, not from `Date.now()` — under
  an instant fake `sleep` a clock-based deadline is never reached, and the timeout test
  either hangs or never fires. Injecting the sleep is only half the trick; deriving time
  from it is the other half.
- **NEVER put `npx -y <pkg>` in an MCP server's launch command.** It was the first thing
  that actually broke this server in a real host: `npx -y` performs a **registry fetch at
  every spawn** and needs a writable npm cache, so it dies on an offline/sandboxed/
  read-only-cache machine, and even when it works it can outrun the host's ~30s MCP
  startup timeout. Either way the host reports a bare **"failed to connect"** with no clue
  why — the server never even ran. `tsx` is already a devDependency; launch the **local
  binary** (`mcp/node_modules/.bin/tsx`) via `mcp/bin/devdigest-mcp`, which is what
  `.mcp.json` now calls.
- **A project-scoped root `.mcp.json` auto-loads in EVERY Claude Code session in the
  repo** (after a one-time approval prompt) — there is no per-session opt-out short of
  `disabledMcpjsonServers` in settings. That is why this server's config lives at
  **`mcp/mcp.json`** and is passed explicitly: `claude --mcp-config mcp/mcp.json`
  (add `--strict-mcp-config` to load *only* it). A config file anywhere other than the
  repo-root `.mcp.json` is inert until named on the command line — which is exactly the
  property you want for a tool set you only sometimes need.
  - **2026-07-14: superseded — we DO want it on by default**, so the config is the root
    `.mcp.json` after all and `mcp/mcp.json` is gone. The mechanism above is still exactly
    right, and it is the thing to remember: **the file's location IS the on/off default.**
    Root `.mcp.json` = on in every session; anywhere else = inert until named with
    `--mcp-config`. The durable off-switch for a root config is
    `{"disabledMcpjsonServers": ["devdigest"]}` in `.claude/settings.local.json` — not a
    CLI flag, and (as far as I could confirm) not a persistent toggle in the `/mcp` panel.
    Isolation still works without a second file: `claude --mcp-config .mcp.json
    --strict-mcp-config` points at the root config and ignores every other MCP source.
- **Claude Code does NOT guarantee the server's cwd is the project root**; it exports
  `CLAUDE_PROJECT_DIR` instead. A relative `args` path like `mcp/src/index.ts` is a
  latent break — `mcp/mcp.json` uses `${CLAUDE_PROJECT_DIR:-.}/mcp/src/index.ts`
  (the config supports `${VAR}` and `${VAR:-default}` expansion).
  - **2026-07-14: superseded — `${...}` in `.mcp.json` is a LOAD-BEARING ASSUMPTION, and
    an unexpanded one is silent death.** If the host does not expand it, the literal
    string `${DEVDIGEST_API_URL:-http://localhost:3001}` is handed to the server as its
    API URL, `config.ts` rejects it (`z.string().url()` → `Invalid url`), the process
    exits 1 on boot, and the host again shows only **"failed to connect."** Reproduced
    exactly. The cwd concern is real but is better solved **in the launcher, not the
    config**: `mcp/bin/devdigest-mcp` resolves its own directory via `BASH_SOURCE`, so
    every path it uses is absolute and cwd is irrelevant. `.mcp.json` therefore holds
    **plain literals only — no `${...}`, no `npx`** — and carries zero assumptions about
    what the host expands.
  - **The general rule this teaches:** an MCP server that fails to boot is
    indistinguishable, from the host's side, from one that doesn't exist. Every unknown you
    put in the launch command (a registry fetch, a variable expansion, an assumed cwd)
    converts into the same useless "failed to connect". Keep the command dumb; put the
    intelligence in a launcher script you can run by hand.

## Recurring Errors & Fixes
<!-- An error seen more than once + its fix. -->

- `TS2589: Type instantiation is excessively deep and possibly infinite` at a
  `registerTool(...)` call → you (re)added a `zod` entry to `tsconfig.json` `paths`.
  Remove it.

## Session Notes
<!-- Datestamped one-liners, newest first: ### YYYY-MM-DD -->

### 2026-07-14
- WP1–WP4 landed in parallel over disjoint files. Suite: **109 tests**, depcruise clean,
  `server` typecheck still green (the type-only alias drags nothing across).
- Closed two gaps the WPs reported rather than worked around: `CatalogService` never got
  `McpConfig` (so a non-429 `ApiError` lost its "errors lead onward" dressing), and
  `errors.ts` had no read-path still-running message (see the money-axis entry above).
- Added the two missing `outputSchema`s — `run_agent_on_pr` and `get_findings` were
  emitting `structuredContent` that nothing declared. Caught by diffing the live
  `tools/list` against the spec, **not** by the unit tests.
- **Verified all five tools against a live API**, including one real paid run:
  `run_agent_on_pr` blocked **95s**, resolved the agent *by name* → uuid, returned
  `verdict: approve` and cost **$0.0204** — and created **exactly one** run row. The
  poll loop did not re-trigger the billable job.

### 2026-07-13
- WP0: scaffold + inner rings landed (ports, http-client + TTL cache, resolve, pure
  domain, five placeholder tools). 57 tests, depcruise clean.

## Open Questions
<!-- Unresolved things worth investigating. -->

- `run_agent_on_pr`'s 180s timeout is a UX knob, not a correctness one (the timeout
  path is safe and env-overridable). Whether a map-reduce strategy on a large diff
  routinely exceeds it is unmeasured.
  - **2026-07-14 — partially answered.** A single-pass review of a **311-file** diff on
    `deepseek/deepseek-v4-flash` took **92s** server-side (95s wall clock through the
    poll loop). So 180s has ~2× headroom for a large single-pass diff. A *map-reduce*
    strategy is still unmeasured, and is the case most likely to breach it.
- Nothing in the tool responses is length-capped in aggregate. `limit` bounds the
  findings/conventions *count*, but a review `summary` is unbounded model prose and
  `detail: 'full'` adds unbounded `rationale`/`suggestion` per finding. A pathological
  review could still approach Claude Code's 25k-token tool-response cap. Unmeasured.
