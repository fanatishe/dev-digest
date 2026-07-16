# EARS, spec sizing, and the review checklist

Load this before writing a spec. It carries the acceptance-criteria syntax, worked examples, the
large-vs-small rule, and the self-check gate.

## EARS — how to write an actionable acceptance criterion

**EARS** (Easy Approach to Requirements Syntax, Mavin / Rolls-Royce, 2009) makes each criterion
collapse into a **single testable statement** — no ambiguity about the trigger, the state, or the
reaction. SDD uses it because an agent can read one EARS line, build the thing, and write the test
that verifies it, without guessing at any point.

### The five patterns

| Pattern | Shape | Example |
|---|---|---|
| **Ubiquitous** (always active) | The system shall … | "The system shall log every authentication attempt." |
| **Event-driven** | **WHEN** … the system **shall** … | "WHEN the user submits the login form, the system shall verify the credentials with the auth-provider." |
| **State-driven** | **WHILE** … the system **shall** … | "WHILE the sync is in progress, the system shall display an unclosable progress indicator." |
| **Unwanted behavior** | **IF** … **THEN** the system **shall** … | "IF credential validation fails three times in 60 seconds, THEN the system shall lock the account for 15 minutes." |
| **Optional feature** | **WHERE** … the system **shall** … | "WHERE MFA is enabled, the system shall require a TOTP code after the password." |

The five patterns are the easy part. The hard part is translating a **vague** requirement into an
unambiguous one. Learn from bad→better:

| Vague requirement | EARS criterion |
|---|---|
| "Should work fine on large repos" | WHEN the repository exceeds the indexing threshold, the system shall generate a review only from deterministic facts, without full file reading. |
| "Should not crash if the model is unavailable" | IF the structured model call fails, THEN the system shall display a deterministic review skeleton with the reason instead of an error. |
| "Should suggest where to start reading" | The system shall order the reading-path by file rank from the import graph, rather than alphabetically or by date. |

### EARS and the project rules file

`AGENTS.md` / `CLAUDE.md` is essentially a list of **ubiquitous** EARS statements about the project
itself ("The system uses TypeScript strict mode", "The system rejects PRs that reduce test
coverage"). Same genre of sentence — that is why the constitution and the spec close the same loop.

## Large vs small — two sizes of spec

A "spec" is not one genre. There are two, and they differ in size.

### Large spec (product / architectural)

The high-level backbone: what features exist and **why**, how modules connect, the main contracts
between them, boundaries (what a module does and does **not** do), the stack, architectural
invariants. It does **not** contain concrete feature implementations, code, or minor detail. Lives
for months, in `spec/` (it spans modules by nature). Its purpose: make the whole product cohere and
keep features reusable.

### Small spec (feature spec)

What you actually hand to the implementer for **one** feature. **1–3 pages.** If it grows larger,
split it into two features. Must contain:

- **Problem and purpose** — the need, and for whom.
- **User stories** — "As a `<role>`, I want `<capability>`, so that `<outcome>`."
- **Acceptance criteria in EARS** — testable, unambiguous, each with an `AC-N` id.
- **Out of scope / Non-goals** — what it intentionally does **not** do. Boundaries matter as much
  as content; they stop the agent inventing things.
- **Edge cases** — empty states, errors, concurrency, network absence.
- **Non-functional** — performance budgets, security, accessibility, observability (if relevant).
- **Unknown markers** — `[NEEDS CLARIFICATION: question]` instead of a guess.

**Not** in a feature spec: stack and code detail (that's the plan level), speculative
"might-need-someday" features, or restatements of the obvious. A good spec describes **behavior and
boundaries**, not implementation.

**DevDigest-specific line — Inputs (provenance).** Not from Spec Kit; ours. It makes "the capstone
compounds in tokens" visible inside the artifact: `[reused: L0X]` / `[deterministic: repo-intel]` /
`[new: N LLM call]`. For Onboarding it is almost entirely `[deterministic: repo-intel]` plus one
`[new: 1 LLM call]` for the narrative. Even before a plan exists, the feature's real cost is visible.

**Practical sizing rule:** a product spec is broad and high-level; a feature spec is narrow,
detailed, and short. A ballooning feature spec is a signal you are describing two features — or have
slipped into implementation detail.

## Spec Review Checklist — the 9-point self-check

Spec Kit calls this "checklists as unit tests for specs." Run all nine before the spec is done — it
is the SKILL's step-5 self-check, verbatim; keep the two lists identical.

1. [ ] **Story coverage** — every user story maps to ≥1 `AC-N`.
2. [ ] **Edge-case coverage** — every edge case maps to an `AC-N`, or is explicitly marked "accepted"
   (with a one-line reason).
3. [ ] **EARS + observable** — every AC is atomic, is one of the five EARS patterns (trigger, state,
   reaction visible), and carries a trailing `_(observable: …)_`.
4. [ ] **Non-goals explicit** — it is clear what the feature intentionally does not do.
5. [ ] **No implementation** — behaviour and boundaries only; no stack, code, file names, or
   function signatures.
6. [ ] **Untrusted inputs addressed** — any someone-else's-text input is named and treated as data.
7. [ ] **Non-functional measurable** — a threshold on each relevant axis (latency, rate-limit, WCAG
   level, observability), or it is moved to Open questions (`[NEEDS CLARIFICATION]`).
8. [ ] **Cross-module interactions documented** — the contracts/diagram between services are pinned.
9. [ ] **Correct ID + path** — `Spec ID: SPEC-NN` (next free, stable, never renumbered), dated
   filename, right folder; `Fits under:` links the product spec if one covers this area.

Also confirm there are **no contradictions** between ACs, and that security/safety boundaries have
explicit **negative ACs** (`IF … THEN … shall NOT …`) — these fall out of points 3 and 5.

## Where the spec stops, and the plan begins

The spec and the plan are the easiest two artifacts to confuse. The boundary: the **plan** targets
the spec's criteria explicitly, with tasks, tests, and the traceability matrix (AC → task → test →
commit). That matrix is the planner's artifact, not yours — it is what `plan-verifier` walks row by
row, and what becomes eval-cases later. **You stop at the acceptance criteria.**
