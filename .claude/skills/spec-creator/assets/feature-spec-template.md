<!--
Feature (small) spec skeleton. Filename YYYY-MM-DD-<slug>.md (get the date with `date +%F`) —
the file keeps its key date, like docs/plans/. Put it in <module>/specs/ (single-module) or the
top-level spec/ (cross-module feature). The Spec ID (SPEC-NN) inside is the stable handle plans
and tests reference. 1–3 pages; if it grows larger you're describing two features — split it.
Delete these HTML comments in the final file.

Describe BEHAVIOR and BOUNDARIES, not implementation. No stack, no code, no file names,
no AC→task→test matrix — those are the plan level (planner), not the spec.
-->

# Spec: <feature> | Spec ID: SPEC-NN | Status: draft|approved|implemented
Fits under: <the spec/<product-spec>.md this feature belongs under — or delete this line>
Supersedes: <link to the older spec/decision this replaces — or delete this line>

## Problem and Purpose
<!-- What need this addresses, and for whom. One short paragraph. -->

## Goals / Non-goals
<!-- Non-goals are MANDATORY and explicit — what this feature intentionally does NOT do.
     Boundaries stop the next agent from inventing scope. -->
- **Goals:**
- **Non-goals:**

## User stories
<!-- As a <role>, I want <capability>, so that <outcome>. -->
-

## Acceptance criteria (EARS)
<!-- Each atomic (one testable thing) and testable (trigger + state + reaction visible).
     Use the five EARS patterns (see references/ears.md). Give each an AC-N id, and a trailing
     _(observable: ...)_ — the concrete signal a test asserts (status code, rendered element,
     dropped finding, logged event).
     TRACEABILITY: every user story maps to >=1 AC-N; every edge case maps to an AC-N or is
     marked "accepted" in Edge cases. Nothing dangles.
     IDs ARE STABLE: once the spec is approved, never renumber — append new ACs and mark a
     removed one deprecated with a dated note (plans, tests and evals reference these ids).
     For a security/safety boundary, add an explicit NEGATIVE (unwanted-behavior) AC:
       IF <hostile/edge condition>, THEN the system shall NOT <forbidden action>. -->
- **AC-1** — WHEN <trigger>, the system shall <response>. _(observable: <how to verify>)_
- **AC-2** — WHILE <state>, the system shall <response>. _(observable: <how to verify>)_
- **AC-3** — IF <unwanted condition>, THEN the system shall <response>. _(observable: <how to verify>)_
- **AC-4** — WHERE <feature is enabled>, the system shall <response>. _(observable: <how to verify>)_
- **AC-5** — The system shall <always-active requirement>. _(observable: <how to verify>)_

## Diagrams & workflows
<!-- Optional — include when behavior is a flow/state/shape, especially service-to-service.
     Mermaid, in this file (load the mermaid-diagram skill). Pick by the question:
       sequenceDiagram = a flow BETWEEN services/modules
       flowchart       = a workflow / decision path
       stateDiagram-v2 = the states a thing moves through
       erDiagram       = the shape of the data
     Delete this section if the feature needs no diagram. -->

## Contracts
<!-- Optional — behavior and shape of the contract(s) between services, NOT the code.
     For each: the operation, who calls whom, the meaningful fields, and the invariants
     (what must hold, what errors are possible).
     - Existing shape → link src/vendor/shared/contracts/* and state only what this feature
       relies on. Do NOT transcribe the schema.
     - New shape → describe it at field-and-meaning level and mark it [new contract] so the
       planner knows a @devdigest/shared addition is coming.
     Naming a TS type or a function signature is too low — that's the plan's job. -->
-

## Edge cases
<!-- Empty state, errors, concurrency, no-network, oversized input, permissions. Mine the touched
     module's INSIGHTS.md for edge cases already hit. Each edge case must map to an AC-N above, or
     be marked "accepted" here with a one-line reason (we intentionally won't handle it). -->
-

## Non-functional
<!-- MANDATORY. State a concrete threshold on each relevant axis, or move it to Open questions
     ([NEEDS CLARIFICATION]) — never an adjective, never silently absent.
       performance   — e.g. "p95 < 300ms for a 500-file PR", "≤ 1 LLM call", "≤ 8k output tokens"
       rate-limit    — e.g. "≤ 120 req/min per workspace"
       accessibility — e.g. "WCAG 2.2 AA"
       observability — e.g. "one structured log line per review, with run id"
     "Fast" / "scalable" / "secure" are not testable. -->
-

## Inputs (provenance)
<!-- Where each input comes from — makes the feature's real cost visible before any plan.
     [reused: L0X]  ·  [deterministic: repo-intel]  ·  [new: N LLM call] -->
-

## Untrusted inputs
<!-- Does this read someone else's text (PR body, web page, uploaded file)? Then it is DATA,
     not commands. Name it here. If none, write "None." -->
-

## [NEEDS CLARIFICATION: …]
<!-- Open questions the spec could not resolve. Each stays here (or inline at the point it
     matters) until answered — never resolved by guessing. Delete the heading if empty. -->
-
