# INSIGHTS — client (`@devdigest/web`)

Append-only engineering insights for this module. Read before you write; add only
significant, non-obvious learnings. See `../.claude/skills/engineering-insights/SKILL.md`
for the rubric.

## What Works
<!-- Approaches, patterns, and solutions that proved effective. problem → what to do. -->

- **A poll that STOPS itself: drive `refetchInterval` off the response payload, not a
  caller-owned flag.** The Blast card's server returns `refreshing: true` while a
  background clone/index resync is in flight. `hooks/blast.ts` polls with the FUNCTION
  form — `refetchInterval: (query) => query.state.data?.refreshing ? 1500 : false`
  (TanStack Query v5) — so the query keeps refetching purely because its own last
  response said so, and stops the instant one comes back `refreshing: false`. This is
  strictly simpler than the older `useRepoIntelStatus(repoId, poll)` pattern
  (`hooks/repo-intel.ts`), where the CALLER owns a `poll` boolean and must itself detect
  completion by watching `lastIndexedSha`/`updatedAt` advance. When the server can tell
  you "still working / done" in the payload, let the hook self-terminate — no component
  state, no effect, no completion-watcher. Pairs with a server staleness signal that is
  itself self-terminating (see `server/INSIGHTS.md`, 2026-07-15). (2026-07-15)

- **Hover popover in a table MUST portal to `document.body` with `position:fixed`.**
  `vendor/ui/primitives/FindingsPopover.tsx` is the module's first real popover
  (everything else used native `title`). An absolutely-positioned popup gets clipped
  by any `overflow:hidden` ancestor — the PR-list `tableCard` (`pulls/styles.ts`) has
  it, so a downward popup was cut off. Fix: `createPortal` to `document.body`, compute
  `fixed` coords from the anchor's `getBoundingClientRect()` in a `useLayoutEffect`,
  flip above when `spaceBelow` is tight, and cap `maxHeight` to the viewport.
  2026-07-09: supersedes the earlier "keep popup a DOM descendant" note below — the
  portal breaks the parent/child link, so `mouseleave` DOES fire when moving onto the
  popup; attach the show/hide handlers to BOTH the anchor wrapper and the portaled
  popup, with a ~120ms close delay, to keep it open across the gap. (2026-07-09)

- **Route error boundaries split by whether the next-intl provider survives.**
  `app/error.tsx` and `app/not-found.tsx` render INSIDE the root layout, so the
  design-system CSS + locale are present — use `useTranslations`/`getTranslations`
  and design tokens there. `app/global-error.tsx` REPLACES the root layout when the
  layout itself throws, so it has NO provider and NO CSS: it must render its own
  `<html>/<body>`, use literal copy, and inline all styles. Don't reach for `t()` or
  `var(--…)` in global-error — they won't resolve. (2026-07-10)

- **A modal's focus-trap/Escape effect must run ONCE on mount (`deps: []`), reading
  `onClose` via a ref.** `vendor/ui/kit/Modal.tsx` keeps `onCloseRef.current = onClose`
  each render and the effect depends on `[]`. Keying the effect on `[onClose]` re-runs
  it on every parent render (onClose is usually an inline arrow), which re-focuses the
  dialog and steals focus mid-typing. Store previously-focused element on mount, restore
  it on unmount. (2026-07-10)

- **A line-numbered / syntax-highlighted code editor = transparent-caret `<textarea>`
  layered over a highlighted `<pre>` + a gutter, no editor lib.** `vendor/ui/kit/CodeEditor.tsx`
  is the pattern: three stacked layers must share IDENTICAL font, `padding`, and a fixed
  numeric `line-height` (px, not unitless) or the caret drifts from the rendered text.
  Set the textarea `color:transparent` + `caretColor:var(--text-primary)`, `wrap="off"`,
  and on its `onScroll` mirror `scrollTop/Left` onto the `<pre>` and gutter. Highlight
  by rendering React nodes per line (a regex pass — headings/list-markers/fences), NOT
  `dangerouslySetInnerHTML`, so there's no escaping/injection concern. Native `placeholder`
  is invisible under `color:transparent` — render the placeholder in the `<pre>` layer
  when `value===""` instead. Drop-in for `<Textarea>` (same value/onChange/rows). (2026-07-11)

- **A new i18n namespace needs ZERO registration.** `src/i18n/request.ts` `readdirSync`s
  `messages/<locale>/` and merges every `*.json` into `{ [basename]: … }`. Dropping in
  `messages/en/blast.json` makes `useTranslations("blast")` work immediately — no import,
  no barrel, no config edit. (That is also why `blast.json` could sit fully written and
  completely unused for two lessons without anything complaining.) (2026-07-14)

## What Doesn't Work

- **DO NOT deep-link a blast-radius CALLER into the Files-changed tab — its file is not in
  the diff.** This is the whole point of a blast radius: callers live in files the PR does
  *not* touch, so the diff viewer structurally cannot render them and the reveal lands on
  nothing. Navigation in `BlastRadiusCard` is therefore **asymmetric, deliberately**:
  a **changed symbol** is in the diff → `setParams({tab:"diff", file})`; a **caller** is
  not → `githubBlobUrl(repoFullName, headSha, file, line)` (the head sha pins the line
  numbers to the code we indexed). Wiring both to the same handler looks tidier and is
  silently broken for half the rows. (2026-07-14, Blast Radius L04)

- **A `?file=` reveal effect must depend on `showSmart`, not just on the file.** `DiffTab`
  mounts one of TWO viewers (`SmartDiffViewer` / flat `DiffViewer`) and the smart-diff query
  resolves *after* the tab first renders. An effect keyed on `[targetFile]` alone runs once
  against the flat viewer's DOM, then never again when the smart viewer swaps in — so the
  scroll silently targets a node that no longer exists. Key it `[targetFile, showSmart]`.
  The `data-path` anchor lives on **`FileCard`** (the shared `components/diff-viewer/` ring),
  not on either viewer, so both inherit it. (2026-07-14)

- **Duplicating a constant to dodge a forbidden import buys time, not safety — and the
  copies diverge faster than you think.** `components/diff-viewer/` is the SHARED ring, so
  it may not import `SEV_COLOR` from a route's `_components/` (the one edge
  `frontend-ui-architecture` forbids outright). Copying the 4-entry severity map looked like
  the only legal move. By the end of the SAME session there were three copies and they had
  drifted **two** ways: only the new one guarded the prototype-chain lookup, and the
  `RunTraceDrawer` copy mapped `SUGGESTION → var(--accent)` instead of `var(--sugg)` — i.e.
  the trace drawer had been rendering suggestion badges the wrong colour, undetected.
  When the shared ring needs a route's constant the answer is **promote to `lib/`**, never
  copy: `components/` → `lib/` is downward and legal. Now `lib/severity.ts` is the single
  home, and all three consumers import `sevToken()` from it. (2026-07-13, Smart Diff)

- **A tab wired into an editor is DEAD if the PARENT view's `?tab=` allowlist omits its key.**
  Adding `<ContextTab>` to `AgentEditor`/`SkillEditor` wasn't enough — the parents
  `AgentDetailView.tsx` / `SkillsWorkbench.tsx` coerce `?tab=` through a `VALID_TABS`
  allowlist, so `?tab=context` fell back to `config` and the panel NEVER mounted (presented
  as "clicking the tab does nothing"). When you add an editor tab, add its key to the parent's
  `VALID_TABS` too. The tab key, `VALID_TABS`, and the nav `activeKeyFor()` case must all use
  the IDENTICAL string. (2026-07-17, Project Context)

- **An inline-style object conditionally spread (`{...base, ...variant}`) must not mix a CSS
  SHORTHAND in the base with its LONGHAND in the variant.** `s.row` set
  `border: '1px solid var(--border)'` and `s.rowSelected` set only `borderColor: 'var(--accent)'`;
  React warns "Removing a style property during rerender (borderColor) when a conflicting
  property is set (border)" and mis-styles on select/deselect (it drops the longhand while the
  shorthand persists). Keep both at the SAME granularity — put the full
  `border: '1px solid var(--accent)'` shorthand in the variant. (2026-07-17)

## Codebase Patterns
<!-- Project conventions, architecture and naming decisions specific to this module. -->

- **A wire-supplied string used as an object KEY needs an own-property guard — `?? FALLBACK`
  cannot save you.** `SEV_COLOR[f.severity] ?? FALLBACK` looks total, but `f.severity` comes
  off the wire: `"constructor"` / `"toString"` resolve UP THE PROTOTYPE CHAIN and return a
  *function*, which is truthy, so `??` never fires — and that function is then handed to
  React as a `CSSProperties` value. Fix: declare the map `as const satisfies
  Record<string,string>` and export ONLY a guarded accessor
  (`Object.prototype.hasOwnProperty.call(MAP, key)`). Under `strict`, `as const` makes any
  arbitrary-string index a **compile error**, so the guard is enforced by the typechecker
  rather than by reviewer vigilance. See `lib/severity.ts`. The pattern recurs anywhere a
  contract enum indexes a token map. (2026-07-13)

- **`Chip` vs `Badge` has a THIRD case: a badge that IS a control.** A clickable severity
  badge (Smart Diff's "jump to this finding") can be neither — `Chip` is a filter chip and
  `Badge` is a `<span>`. It is a bare `<button>` styled from `styles.ts`, with the
  accessible name in `aria-label`: colour + icon alone is invisible to a screen reader AND
  unqueryable by `getByRole`. (2026-07-13)

- **A multi-key URL update MUST be one `router.replace`, not two `setParam` calls.**
  `PrDetailView`'s `setParam(key, val)` rebuilds the query string from the CURRENT `search`
  snapshot, so `setParam("tab",…); setParam("finding",…)` makes the second call read a STALE
  `search` and CLOBBER the first — the finding deep-link silently loses its `tab`. Added
  `setParams(patch)` (one `mergeParams` + one `replace`) and reimplemented `setParam` in
  terms of it, so the clobber is now structurally impossible. Test it by asserting
  `replace` was called **exactly once** with both keys — a call-count of 1 is what fails on
  a two-call implementation. (2026-07-13)

- **`Chip` (`vendor/ui`) renders a `<button>` — it is for INTERACTIVE filter chips only.**
  For a static chip-looking label (e.g. the Intent card's risk areas) use `Badge` (a
  `<span>`) with `bg="transparent"` + `style={{ border: "1px solid var(--border)" }}`. Same
  look, no phantom buttons polluting `getAllByRole("button")` and screen-reader output.
  (2026-07-12, Intent Layer)

- **`SectionLabel`'s `right` slot is the house place for a card's header actions.** An
  icon-only action there should be `<Button icon="…" loading={mutation.isPending}
  aria-label={…} />`, NOT `IconBtn` — `IconBtn` has no `loading` state, and `Button`
  spreads `ButtonHTMLAttributes`, so the `aria-label` that an icon-only control requires
  actually type-checks. (2026-07-12)

- **ICU quoting bites in `messages/en/*.json`:** an apostrophe is next-intl's escape
  character, so write `"is not available"` rather than `"isn't available"` unless you
  double it. Also pass PRE-FORMATTED numbers (`toLocaleString("en-US")`) into a message
  instead of raw numbers, so a rendered string like `12,431 → 890 tokens (93% saved)` is
  deterministic in tests. (2026-07-12)

- **Native HTML5 drag-reorder should reorder by ID, not by list index.** The agent
  editor's Skills tab (`AgentEditor/_components/SkillsTab`) lets you filter the list
  AND drag to reorder. If `onDrop` reordered by the rendered index, a filtered view
  would move the wrong row. Track `dragId`, and on drop splice within the full
  `order: string[]` at `indexOf(targetId)` — correct under any filter. The checkbox
  = link membership (attach/detach via `POST /agents/:id/skills { skill_ids }`);
  there is no per-agent "enabled" flag, so "attached" IS "enabled for this agent".
  Keep a local `order` state and resync from the server set via an effect keyed on
  `linkedIds.join(",")` so post-mutation cache writes don't fight optimistic order.
- **The icon registry (`vendor/ui/icons.tsx`) is a fixed lucide subset — check
  before using.** `Sparkles`, `Upload`, `Link`, `Globe`, `Menu`, `Star`, `Trash`,
  `Eye`, `History`, `BarChart`, `FlaskConical`, `Play` exist; `GripVertical` and
  `Download` do NOT. Use `Menu` for a drag handle and `Plus` for an import action, or
  add the lucide import to the registry first. `Edit` is an alias for `Pencil`.
  (2026-07-11)

- **A master–detail screen with a shared list should render ONE component from both
  routes, not duplicate the list.** The Skills page (`_components/SkillsWorkbench`) is
  rendered by BOTH `/skills/page.tsx` and `/skills/[id]/page.tsx`; the `id` prop drives
  the right pane (editor vs "select a skill"). Selecting a card is `router.push`, tab
  state lives in `?tab=` via `router.replace`. This is cleaner than AgentDetailView,
  which re-declares the left list. **Inline create-draft pattern:** an editor's Config
  tab takes `skill?` — with a skill it edits; without one it's a draft whose first Save
  `POST`s and calls `onCreated(created)` so the parent routes to `/skills/[id]`. No
  empty rows are created until save. `@devdigest/ui` already exports a `Markdown`
  primitive (react-markdown + gfm) — use it for "rendered" previews instead of a new
  dep, and a ~25-line LCS `lineDiff` covers a version-diff modal without a diff lib.
  (2026-07-11)

- **"Reveal a child by nonce" — to expand/scroll to a component that owns its own
  state.** A bare id or URL param can't re-trigger for the *same* value (re-clicking
  the same finding). Pattern: parent holds `{ id, n }` state, bumps `n` on every
  request; the child effect keys on `[revealNonce, id]` and acts. Used by the
  Agent-runs tab twice: run-scroll (`ReviewRunAccordion` `targetRunId/targetNonce`)
  and finding-reveal (`FindingsTab` → accordion → `FindingsPanel` → `FindingCard.reveal`
  → `setExpanded(true)` + `scrollIntoView`). When the target may be hidden by a filter,
  force-include it (`FindingsPanel` re-adds the revealed finding even under a severity
  filter / hide-low). In tests, stub `Element.prototype.scrollIntoView = vi.fn()` —
  jsdom doesn't implement it and the reveal effect will throw otherwise. (2026-07-10)

- **A PR-list column spans four coordinated edits.** The table is CSS-grid driven:
  add the track to `GRID` and the key to `COLUMN_KEYS` (`pulls/constants.ts`), render
  the cell in `PRRow.tsx`, and add the `list.columns.<key>` string in
  `messages/en/prReview.json`. Miss one and the header/rows misalign silently.
- **Reusable inline badges should inherit colour, not set it.** `RunCostBadge` renders
  normal in the PR list but muted in the timeline by leaving `color` unset for a
  present value (inherits the cell) and forcing `--text-muted` only on the empty dash.
  Hard-coding `--text` made it clash with the muted timeline row. (2026-07-09)

- **Destructive confirms go through the promise-based `useConfirm()` (`lib/confirm.tsx`),
  never `window.confirm`.** `<ConfirmProvider>` (mounted in `lib/providers.tsx` under
  RepoProvider) renders a single `<ConfirmDialog>` and `useConfirm()` returns
  `(opts) => Promise<boolean>`, so call sites read `if (await confirm({ title, message,
  danger: true })) mutate()`. It works from hooks too — `useShellContext.onRemoveRepo`
  became `async` and awaits it. Accessible (focus-trapped Modal + Escape) and testable,
  unlike the native blocking dialog. (2026-07-10)

- **Reset a colocated form on identity change with `key={agent.id}`, not a prop→state
  sync effect.** `AgentEditor` renders `<ConfigTab key={agent.id} agent={agent} />`; the
  remount re-runs ConfigTab's `useState` initializers. This replaced a 9-`setState`
  `useEffect([agent.id])` (a "you-might-not-need-an-effect" case) and its
  `eslint-disable`. Regression test asserts a local edit doesn't leak across an agent
  switch. (2026-07-10)

- **All query hooks forward React Query's `AbortSignal` to fetch.** `api.get(path, signal?)`
  passes it into `apiFetch`; queryFns are `({ signal }) => api.get(path, signal)` so
  navigating away / refetching cancels the in-flight request. Mutations don't take a
  signal. (2026-07-10)
  - **CORRECTION (2026-07-12): this is no longer true — do not follow it.** The
    `AbortSignal` param was reverted (see the 2026-07-11 audit note further down);
    `src/lib/api.ts` is now `get: <T>(path: string) => apiFetch<T>(path)` — **no signal
    param**. Write query fns as `queryFn: () => api.get(path)`. Left above rather than
    deleted because two sessions in a row have been misled by it: a reverted change
    whose INSIGHTS entry survives is more dangerous than no entry at all, because it is
    read as high-confidence guidance.

- **Per-route tab titles need a SERVER page — a `"use client"` page can't export
  `metadata`/`generateMetadata`.** Root `layout.tsx` sets
  `title: { default: "DevDigest", template: "%s · DevDigest" }`, so a route only sets a
  short `title` ("Agents") and it renders "Agents · DevDigest". Pattern for the pilot:
  keep `page.tsx` a thin Server Component that renders a colocated client `*View`; add
  static `metadata` (e.g. `/agents`) or async `generateMetadata({ params })` (Next 15:
  `params` is a Promise — `await` it; see `/settings/[section]`). Pages that hold client
  hooks in the page BODY (`/agents/[id]`, `/repos/**/pulls`, `pulls/[number]`, `/`) must
  first have that body extracted into a client `*View` before they can earn a title —
  larger follow-up. Dropping a redundant page-level `"use client"` (as on `/onboarding`,
  a pure wrapper) also makes it statically prerenderable → smaller first-load JS. (2026-07-10)

- **The sidebar is fully data-driven — adding a nav section/item is a `vendor/ui/nav.ts`
  edit only.** `shell/Sidebar.tsx` `.map`s over `NAV` groups (renders each `section`
  header) and appends `SETTINGS_ITEM`; `activeKeyFor()` (`components/app-shell/helpers.ts`)
  already reserves keys for not-yet-built routes (conventions/eval/memory/…), so no
  renderer change is needed. The Pull Requests count badge is ALSO already wired —
  Sidebar injects `badge: String(ctx.prCount)` onto the `pulls` item when `ctx.prCount`
  is set; don't add a static badge in `nav.ts`. Only list items whose pages exist —
  a nav item pointing at a missing route just 404s. (2026-07-11)
  - **CORRECTION/EXTENSION (2026-07-17): a nav item is NOT a `nav.ts` edit ALONE — the label
    is i18n.** The sidebar and command palette render the label via `t(\`nav.${item.key}\`)`
    in the `shell` namespace (`app-shell/hooks/useShellCommands.ts`), so a `nav.ts` item whose
    key lacks a `nav.<key>` entry in `messages/en/shell.json` throws
    `MISSING_MESSAGE: shell.nav.<key>` and renders blank. Adding a nav item = a `nav.ts` entry
    **+** a `shell.json` `nav.<key>` string **+** (for highlighting) a matching `activeKeyFor()`
    case. The `label` field on the `nav.ts` item is NOT what renders. (Project Context)

- **A new `@devdigest/ui` primitive that uses hooks/refs does NOT need a `"use client"`
  directive.** No file in `vendor/ui/kit/` declares it — not even `Modal.tsx` (3 hooks).
  They inherit the client boundary from the `"use client"` app pages that render them.
  Match that: don't sprinkle `"use client"` on design-system components. (2026-07-11)

## Tool & Library Notes
<!-- Quirks and gotchas of dependencies/tooling. -->

- **The UI `Severity` type (`vendor/ui/tokens.ts`) is wider than the contract one.**
  It adds `INFO`, so indexing a 3-key `{CRITICAL,WARNING,SUGGESTION}` counts object
  by a `Severity` from `@devdigest/ui` fails typecheck (`Property 'INFO' does not
  exist`). Narrow the iteration keys with `as const` (e.g.
  `["CRITICAL","WARNING","SUGGESTION"] as const`) rather than typing them `Severity[]`.
  Contract-side `Severity` (`vendor/shared/contracts/findings.ts`) is the 3-value enum. (2026-07-09)

- **next-intl THROWS on a missing key within a PRESENT namespace, but only LOGS (key
  fallback) when the WHOLE namespace is absent.** A missing `projectContext.foo` inside a
  mounted `projectContext` provider blanks the subtree (a real "the panel is empty" failure);
  a component reading a namespace the test's `NextIntlClientProvider` never supplied just
  renders the raw key and passes. So an editor shell that resolves a label from a SECOND
  namespace (e.g. `AgentEditor` → `projectContext` for its tab label) must have its tests
  PROVIDE that namespace, or the failure mode differs between test (passes) and runtime
  (throws/blanks). (2026-07-17, Project Context)

## Recurring Errors & Fixes
<!-- An error seen more than once + its fix. -->

- **Threading React Query's `AbortSignal` into `fetch` requires letting `AbortError`
  propagate — don't wrap it as a network error.** `apiFetch`'s `catch` originally turned
  EVERY fetch rejection into `ApiError(status 0, "network_error")`. Once the query signal
  is passed to `fetch`, a cancelled request (refetch / `refetchOnWindowFocus` / navigation
  — `usePulls` does all three) rejects with a `DOMException` `AbortError`, which then got
  mislabeled as "Cannot reach the DevDigest engine" and fired the global `status === 0`
  error toast on ordinary navigation. Fix: `if (e instanceof DOMException && e.name ===
  "AbortError") throw e;` before the network-error wrap, so the query layer sees a
  cancellation, not a failure. (2026-07-10)

- **`useConfirm must be used within <ConfirmProvider>` in component tests.** Any
  component that (even indirectly) calls `useConfirm` — e.g. `AgentCard`'s delete button —
  throws when rendered bare. Wrap the test tree in `<ConfirmProvider>` alongside the
  existing intl/query/toast providers (see `AgentCard.test.tsx`'s `renderWithIntl`). Same
  class of failure as a missing `ToastProvider`. (2026-07-10)

- **A row-label cosmetic that splits a path into SEPARATE DOM nodes breaks any PARENT-level
  test asserting the full path via `getByText('<dir>/<file>')`.** Splitting `specs/a.md` into
  a bold `a.md` + a muted `specs/` broke `AgentEditor.test.tsx`'s `getByText('specs/a.md')`
  (no single node holds the concatenated text). When changing a widely-embedded presentational
  row, grep the ancestor editors' `*.test.tsx` for the old full-text before assuming the suite
  stays green. (2026-07-17, Project Context)

## Session Notes
<!-- Datestamped one-liners, newest first: ### YYYY-MM-DD -->

### 2026-07-17 (Project Context SPEC-01 — page, Context tabs, bug fixes)
Built the `/project-context` two-pane master–detail page (list + inline Preview/Edit
(read-only) pane fed by a new `useContextDocContent` hook), the agent+skill Context tabs
(attach/detach/reorder + eye-button `DocPreviewDrawer` + a "SERIALIZES AS" manifest grouped
by root), and trace-drawer additions. `DocPreviewDrawer` is DUPLICATED colocated per tab and
kept hook-agnostic (attachment passed as `attached`/`onToggleAttached`), matching the
no-sideways-import rule and the `RunTraceDrawer`/`ImportDrawer` convention — NOT promoted to
`components/` (that "promote, never copy" rule is for constants, not route-owned feature UI).
Read-only Edit = `CodeEditor` with no `onChange`. Fixed two runtime bugs mocked-fetch tests
missed: the Context tab never mounted (parent `VALID_TABS` allowlist — see What Doesn't Work)
and `MISSING_MESSAGE: shell.nav.project-context` (nav label i18n — see the nav correction).

### 2026-07-14 (Blast Radius L04)
Built the Blast-radius card into the Overview grid's long-standing placeholder slot —
stat row · tree · SVG graph · "Prior PRs touching these files". `messages/en/blast.json`
already existed, fully written and unused (tree/graph/cron strings included), and needed no
registration to start working. **The card's most important state is the DEGRADED one:** an
unindexed repo returns an *empty* blast radius, which reads exactly like "nothing is
affected" — so a degraded response renders a warning saying **"unknown", never a blank
card**, and the RTL test asserts that copy rather than the happy path. The graph is
hand-rolled SVG on purpose: the topology is always the same three columns, so a layout
library would be tens of KB to compute three `x` coordinates — and it would move nodes
between renders, which is the opposite of what someone scanning "what does this touch"
wants. Stat counts are DISTINCT endpoints/crons, not the per-symbol sum (two symbols
reaching one endpoint is one endpoint at risk). Made the stat row `role="list"` +
`role="listitem"` with an `aria-label` per stat — a screen reader was otherwise announcing
the number and the word as two unrelated fragments, and the RTL query for it was walking
DOM siblings, which is a test smell that means the markup is wrong.

### 2026-07-13 (Smart Diff L03)
Built `SmartDiffViewer` (grouped core/wiring/boilerplate, boilerplate collapsed, intent
context header) on the PR page's Files-changed tab, with a Smart/Original order toggle whose
"Original" branch renders today's flat `DiffViewer` untouched. **The big lesson: the feature
was almost entirely WIRING, not new mechanism.** The whole badge→finding deep-link already
existed as the documented "reveal a child by nonce" chain (`?finding=` → `FindingsTab` nonce
→ `ReviewRunAccordion` opens the owning run → `FindingsPanel` force-includes it under a
filter → `FindingCard` expands + scrolls); it was simply only ever driven by the PR-list
popover. Making a diff-line badge drive it too was an onClick + a multi-key `setParams`.
Before building a "missing" feature here, check whether the chain already exists and just
lacks a second caller — this is the second session in a row where that was true (cf.
2026-07-12 conventions inline edit). Extended the SHARED `diff-viewer` at two surgical seams
only (`FileCard.defaultOpen`, `CodeLine` per-line findings), reusing the inline-comment
feature's exact `Map<"RIGHT:123", …>` per-line lookup shape rather than inventing a second
one. No diff library added; `parsePatch` still ours.

### 2026-07-12 (Conventions: inline rule edit + evidence deep-link)
Closed two gaps on `ConventionCandidateCard` that were **pure UI wiring over a backend that
already worked**: `PATCH /conventions/:id` accepted `{rule}` and `useAcceptConvention` already
sent it — no UI ever called it with a rule, so inline edit needed ZERO hook/server change.
Worth internalising: before building a "missing" feature here, check whether the hook and
route already support it. Details. (1) The rule editor copies `InlineComposer`'s shape
(Textarea + Save/Cancel, Esc cancels, Cmd/Ctrl+Enter saves) — the house precedent for
edit-in-place; there is still no generic `EditableText` primitive. (2) `evidence_path` is a
PACKED string (`"file:23-25"`), not structured fields, so linking it needs a parser — added
`parseEvidencePath` next to the existing `githubBlobUrl` in `lib/github-urls.ts` (splits on
the LAST colon; a non-numeric suffix falls back to a bare path). Reuse `githubBlobUrl`; don't
write a second URL builder. (3) `MonoLink` already emits `<a target="_blank"
rel="noopener noreferrer">` when given `href` — it IS the GitHub-link primitive; render plain
text (not an href-less MonoLink, which becomes a pointless `<button>`) when there's nothing
to link to. Link only when repo full_name AND `evidence_sha` are both present. (4) Re-scan is
a destructive full replace server-side, so it silently ate hand-edited rules — gated it behind
the existing `useConfirm()`. Typecheck + 83 tests green (+19).

### 2026-07-11 (Conventions tab + Skill Dynamics)
Built the Conventions tab (Skills Lab). Mostly wiring — `messages/en/conventions.json`,
the `ConventionCandidate` contract, the `/conventions` key in `activeKeyFor`, and the
`ListChecks` icon all pre-existed. Net-new: `app/conventions/` (thin page → single-column
`ConventionsWorkbench`, NOT master–detail like Skills), `ConventionCandidateCard`
(confidence bar + Accept/Reject mirroring `FindingCard`'s `active`/`disabled` pattern),
and `CreateSkillModal`. The create-from-conventions flow reuses the import→confirm shape:
a server endpoint (`GET /repos/:id/conventions/skill-draft`) returns an UNSAVED merged
draft, the modal edits it, then the EXISTING `useCreateSkill` (`POST /skills`) persists —
on success `router.push('/skills/{id}?tab=config')` to land on the new skill's Config tab.
Gotcha: `TraceSection`'s `icon` prop is a restricted union
(`Settings|Gauge|FileText|Wrench|Code|AlertOctagon`) — "Sparkles" fails typecheck; used
`FileText` for the new **Skill Dynamics** trace section, which renders `trace.config.skills`
(per-skill exact body via `PromptBlock`), guarded `!= null` so old traces still render.
Typecheck + 64 client tests green (+4 ConventionCandidateCard).

### 2026-07-11 (Skills Lab design pass)
Aligned the Skills screen to new designs (delta pass — feature already existed). (1)
Split the single-group sidebar into WORKSPACE (Pull Requests) + SKILLS LAB (Skills,
Agents) — pure `nav.ts` edit; omitted the unbuilt GLOBAL/Conventions/Eval/… items. (2)
New `vendor/ui/kit/CodeEditor.tsx` (textarea-overlay, line numbers + md highlight) swapped
into ConfigTab's body field. (3) StatsTab given its final layout — real used_by/agents
list + SAMPLE pull%/accept%(ring)/findings/by-category `Donut`, with an honest "sample
data until reviews attribute findings" caption; no backend/schema change. Typecheck +
60 tests green (+4 CodeEditor).

### 2026-07-11 (self-review fixes)
Post-refactor review caught 3 latent bugs, now fixed: (1) `Modal`'s a11y key handler
was a `document` listener that fired for every open modal — added a module-level
`modalStack` so only the topmost modal reacts to Escape/Tab (stacked
ConfirmDialog-over-modal no longer closes both / fights the focus trap); (2)
`ConfirmProvider` orphaned the prior promise when `confirm()` was called while one was
open — it now settles the previous pending as `false` before replacing it; (3) reverted
`TraceBody` specs key to a composite `${sp}-${i}` (static list; the bare `key={sp}` added
a needless uniqueness assumption). Typecheck + build + 44 tests green.

### 2026-07-11 (audit items #9–#11)
Reconciled the query hooks back to `() => api.get(path)` after `api.ts` dropped the
AbortSignal param (kept the codebase self-consistent; green baseline restored). #9 tests:
+7 (44 total) — `parseSeverity` (PrDetailView helper), `ReviewNotices`, `LiveReviewBanner`
(RunStatus stubbed); `RunRow`'s outcome logic is already covered indirectly by
`RunHistory.test`. #10: wrote `docs/styling.md` — the decision record for `styles.ts`
inline-object + CSS-var-token styling and why Tailwind stays inside `vendor/ui` only.
#11: `docs/react-compiler.md` — React Compiler pilot is *prepared not activated* (needs
`pnpm add -D babel-plugin-react-compiler`; can't install here — pnpm absent, npm would
corrupt the pnpm node_modules; flipping the flag without the plugin breaks the build).

### 2026-07-10 (frontend hardening)
Acted on a React/Next best-practices audit of `client/`. Added route boundaries
(`error.tsx`, `global-error.tsx`, `not-found.tsx`); replaced all 4 `window.confirm`
calls with an accessible promise-based `useConfirm()` + `ConfirmDialog`; gave `Modal`
focus-trap/Escape/`aria-labelledby`; swapped ConfigTab's reset-effect for
`key={agent.id}`; threaded `AbortSignal` through every query hook (+ fixed the
abort-masquerade bug); fixed filterable-list keys (`DiffViewer`→`path`, specs→string).
Next.js audit verdict: mostly covered (client-hook params, layout `<Suspense>`
legitimizes `useSearchParams`, no img/font concerns); the real gap is per-route metadata
(blocked by client-component pages). RSC/metadata pilot: title template in root layout +
static/`generateMetadata` on `/agents`, `/settings/[section]`, `/onboarding`, and
extracted `/agents/[id]` and `/repos/**/pulls/[number]` bodies into
`_components/AgentDetailView` / `_components/PrDetailView` so both pages are thin Server
Components with metadata — the PR page derives a dynamic title ("PR #123") straight from
the route param, no fetch. #8 splits: `FindingsTab` 255→191 (LiveReviewBanner /
ReviewNotices / ReviewRunsHeader), `RunHistory` 255→82 (RunRow / CommitRow), `PrDetailView`
203→195 (parseSeverity → helpers.ts, PrDetailSkeleton). Every feature component is now
≤200 lines; only the dev-only `Showcase` gallery remains larger. Typecheck + build + 37
tests green throughout.

### 2026-07-10
Made popover finding-rows clickable → open that finding on the Agent-runs tab
(expand + scroll). PR-list path deep-links via `?finding=<id>`; timeline path reveals
in-place and clears the severity filter. Reused the run-scroll nonce pattern at card
granularity; `FindingCard` gained a `reveal` nonce prop.

### 2026-07-09
Added findings-severity counters + hover popover + `?severity=` filter to the PR list
and agent-runs timeline. New `FindingsPopover` primitive and shared
`components/FindingsSeverityCounts`; timeline counts derived client-side via
`RunHistory/helpers.ts` (`findingsByRun`), list counts from the server rollup.

## Open Questions
<!-- Unresolved things worth investigating. -->
