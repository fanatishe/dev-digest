---
name: dependency-checker
description: >-
  Audit the DevDigest repo's dependencies — both the external npm packages every
  package pulls in AND the internal component graph between the six packages —
  then produce a structured Markdown report with a Mermaid diagram, per-package
  weight (bundle size + transitive count), and ranked, actionable advice. Use
  whenever the user asks to analyze / map / audit / visualize dependencies, find
  the heaviest or unused or duplicated packages, check what's outdated or
  vulnerable, understand coupling between packages, "see what we depend on",
  draw a dependency diagram, or asks where the bloat / bundle weight is coming
  from. Trigger even when they don't say the word "dependency" — "why is the
  client so big", "what are we shipping", "map how our packages connect", and
  "what can we drop" all belong here.
---

# Dependency Checker (DevDigest)

Produce one grounded, developer-readable report that answers four questions a
maintainer actually asks: **What do we depend on? How is it wired together? What
does it cost? What should we do about it?** The report is a Markdown file with a
Mermaid diagram, weight tables, and a ranked recommendations list.

This skill is **hardwired to this repo** — it knows the packages, the aliases,
and the traps below. Don't rediscover them; use them.

## What you already know about this repo (don't re-derive)

- **Six packages, not a monorepo.** Each owns its `package.json` + lockfile:
  `reviewer-core` · `server` (`@devdigest/api`) · `mcp` · `e2e` · `client`
  (`@devdigest/web`) · `evals`. Plus **`@devdigest/shared`** — Zod contracts that
  live at `server/src/vendor/shared` and are copy-vendored into the client.
- **Cross-package code flows through two tsconfig aliases only**:
  `@devdigest/reviewer-core` and `@devdigest/shared`. Those are the sanctioned
  internal edges; anything reaching past them is a finding.
- **Lockfiles are mixed**: `server`, `client`, `evals` → pnpm; `reviewer-core`,
  `e2e`, `mcp` → npm. Any per-package command must use the right tool.
- **Only `client` ships a browser bundle** (Next.js). `server` / `mcp` /
  `reviewer-core` run from TS **source** with no build step, so "bundle size" is
  meaningful only for the client. For the backends, weight = transitive count +
  install footprint. Say this in the report rather than inventing a bundle number.
- **Traps**: `server/clones/**` is a stale copy of the whole tree — never scan
  it. A `.next/` directory may be a *dev* build; its chunk sizes are not the
  production bundle (see step 2).

## Workflow

### 1. Collect the hard facts (scripted, deterministic)

Run the bundled collector from the repo root:

```bash
node .claude/skills/dependency-checker/scripts/collect.mjs > /tmp/dep-report.json
```

It emits JSON with, per package: direct deps + versions, dev deps, lockfile
type, **total installed transitive count**, `node_modules` size, the 8 heaviest
direct deps by real on-disk size (symlinks resolved for pnpm), and the internal
`workspaceEdges` (who imports which alias). This is your measurement backbone —
don't hand-count what the script already counted.

### 2. Get the real client bundle size

The collector reads `.next/static` as a fallback, but a dev `.next` inflates it
wildly. For the number you'll actually report, run a production build and read
its printed route table (the **First Load JS** column is what ships):

```bash
cd client && pnpm build   # prints Route / Size / First Load JS
```

If a build is too expensive for this run, say so and fall back to the collector's
chunk total **clearly labelled as an estimate** — never present an unverified
number as fact.

### 3. Gather the four judgement lenses

Run these and fold the results into Findings (§4 of the template):

- **Heaviest / trim** — rank `heaviestDeps` and transitive counts from the JSON.
  A dep that is huge *and* only lightly used is the best trim candidate.
- **Unused / duplicated** — from `versions`, flag the same library pinned at
  different majors across packages (e.g. two Zod versions = a contract-drift
  risk, since `@devdigest/shared` is Zod). For *unused*, spot-check suspicious
  direct deps with `grep -rlE "from ['\"]<dep>" <pkg>/src` — declared but never
  imported = drop candidate. Don't claim "unused" without checking imports.
- **Risk & freshness** — per package, in its own dir with its own tool:
  `pnpm outdated` / `npm outdated` for version drift, and `pnpm audit` /
  `npm audit` for advisories. Summarize majors behind and any advisory, not the
  raw dump.
- **Coupling & boundaries** — the repo already ships dependency-cruiser rulesets.
  Run the onion ruleset for backend layering and the mcp config; report cycles,
  layer violations, and any cross-package import not going through an alias:
  ```bash
  cd server && npx depcruise src --config \
    ../.claude/skills/onion-architecture/assets/onion.dependency-cruiser.cjs 2>&1 | tail -30
  ```
  If dependency-cruiser isn't runnable, fall back to the `workspaceEdges` in the
  JSON and reason about the graph directly.

### 4. Draw the diagram

Load the `mermaid-diagram` skill for syntax, then render the **internal**
component graph from `workspaceEdges`: the six packages + `shared`, arrows along
real import edges, grouped by onion role (inner `reviewer-core`/`shared` →
outer `server`/`client`/`mcp`). Keep it to the internal graph — a node per npm
dep would be unreadable. If a boundary violation was found in §3, draw that edge
in red so it's visible at a glance.

### 5. Write the report

Write to `docs/dependency-report-<YYYY-MM-DD>.md` (use today's date). Follow the
template below exactly — the fixed shape is what makes it skimmable and diffable
run-over-run. Every number must trace to the JSON, the build output, or a command
you actually ran; if you couldn't measure something, write "not measured" and why,
never a guess.

## Report template

```markdown
# Dependency Report — DevDigest (<date>)

_Generated by the dependency-checker skill. Data: `collect.mjs` + `pnpm build` + depcruise._

## 1. At a glance
| Package | Direct | Transitive | Weight | Flags |
|---|---|---|---|---|
| client | 11 | 536 | <First Load JS> shipped · 603 MB installed | <e.g. mermaid heavy> |
| server | 22 | 557 | source (no bundle) · 213 MB installed | … |
| … | | | | |

One-paragraph verdict: the single most important thing to know.

## 2. Component graph
<Mermaid diagram: the six packages + shared, edges via aliases, onion grouping.
 Boundary violations in red.>

## 3. External weight
Per package, a short table of its heaviest deps (bundle contribution for client;
install size + transitive pull for the rest), with the top offender called out.

## 4. Findings
### 4.1 Heaviest — trim candidates
### 4.2 Unused / duplicated (version drift)
### 4.3 Risk & freshness (outdated · advisories)
### 4.4 Coupling & boundaries
Each finding: what, where (package + dep/edge), why it matters, evidence.

## 5. Prioritized recommendations
| # | Priority | Package | Action | Effort | Payoff |
|---|---|---|---|---|---|
| 1 | High | client | Lazy-load `mermaid` (76 MB, one route) | S | −First Load JS |
| … | | | | | |

Rank by (payoff ÷ effort). High = ships to users or is a real risk; Low = tidy-up.
```

## Prioritisation rubric (for §5)

Rank recommendations so a developer knows what to do *first*, not just a list:

- **User-facing weight beats install weight.** A heavy dep in the client's First
  Load JS costs every visitor; the same dep in `e2e` devDeps costs no one at
  runtime. Weight the client bundle highest.
- **Risk before tidiness.** A known advisory or a version-drifted contract lib
  (Zod across `shared`) outranks "this folder is a bit big".
- **Effort-aware.** Prefer lazy-load / replace-with-lighter / dedupe-version wins
  over "rewrite to remove". Note effort as S/M/L honestly.
- **Boundary violations are architectural debt** — surface them even if small;
  they compound. Link the onion-architecture skill for the fix.

Keep the tone advisory and specific. "Drop `moment`, use the 3 date fns you
actually call" beats "reduce dependencies". No recommendation without its
evidence from the report above it.

## Known limitations (read before trusting a number)

An eval run of this skill surfaced five things it does NOT handle cleanly. Until
they're fixed, work around them explicitly rather than being surprised:

1. **A dev `.next` is not a bundle.** The collector reads `.next/static` as a
   bundle proxy, but if that directory is a `next dev` build (no `BUILD_ID`, a
   `static/development/` folder, ~10 MB unminified per-route chunks) the number
   is inflated by an order of magnitude and meaningless. If you can't run a real
   `pnpm build`, report client First Load JS as **"not measured"** with the
   reason — do NOT pass the dev figure off as an estimate.
2. **No fallback when the package manager is missing.** Step 3 assumes `pnpm`
   is on PATH for the pnpm packages (`server`, `client`, `evals`). Where it
   isn't, `npm audit`/`npm outdated` fail with `ENOLOCK` on those packages and
   they simply can't be audited. Try `corepack pnpm` / `npx pnpm`; if that also
   fails, mark those packages' freshness/audit **"not measured (pnpm
   unavailable)"** rather than silently skipping them.
3. **npm cache may be root-owned.** In some sandboxes npm's default cache throws
   `EACCES`. If `audit`/`outdated` fail that way, redirect it:
   `NPM_CONFIG_CACHE=<writable-dir> npm outdated`.
4. **The template's example rows can go stale.** The illustrative "lazy-load
   `mermaid`" row is already false in this repo — `mermaid` is loaded via
   `await import(...)`. Treat the template rows as shape only; verify every real
   recommendation against actual imports (`recharts` is the true eager-heavy
   client import today).
5. **"Boundary" means two different things.** §4.4 red edges suggest
   cross-package violations, but the violations you'll usually find are
   *intra-package onion-layer* ones (e.g. `server` routes importing the DB
   directly — `routes-no-db`). Label which kind you found; don't force an
   intra-package layer violation into a package-edge diagram.
6. **Scope is the six hardwired packages + `shared`.** The collector does not
   scan `domains_wiki/crawler` (a side project) and does not dedupe-scan the
   store, so duplicate installs (e.g. multiple `esbuild` copies) won't show up
   in its numbers — check those manually if they matter.
