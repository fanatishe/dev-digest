<!--
Large (product / architectural) spec skeleton. Copy the block below into spec/<slug>.md.
This is the backbone document: it describes the product and how it fits together, and it
lives for months. It spans multiple modules by definition — that is why it lives in spec/,
not in a single module's specs/.

What it MUST NOT contain: concrete feature implementations, code, or minor detail. Those are
feature specs (assets/feature-spec-template.md) and plans (planner). If you find yourself
writing an acceptance criterion for one feature, you are in the wrong document.

Delete these HTML comments in the final file.
-->

# Product Spec: <product or subsystem> | Spec ID: SPEC-P-NN | Status: draft|approved|implemented
Supersedes: <link to the older product spec this replaces — or delete this line>

## Purpose
<!-- What this product/subsystem is for, and who it serves. -->

## Features and why
<!-- The features that exist and the reason each one does — not how it is built. -->
-

## Module map & connections
<!-- Which modules exist and how they connect. A Mermaid diagram is expected here — a flowchart
     for dependencies, or a sequenceDiagram for a cross-service flow (load the mermaid-diagram
     skill for syntax). Keep it in this file so it's reviewed with the prose. -->

## Main contracts between modules
<!-- The load-bearing contracts modules agree on (link the Zod source of truth, e.g.
     src/vendor/shared/contracts/*; do not transcribe schemas). -->
-

## Boundaries
<!-- For each module or the product: what it DOES, and — just as important — what it does NOT do. -->
- **Does:**
- **Does not:**

## Stack & architectural invariants
<!-- The stack, and the rules that must hold across the whole product (e.g. onion dependency
     rule, "extend the schema, never migrate shared tables", secrets never touch git/DB). -->
-

## [NEEDS CLARIFICATION: …]
<!-- Open questions. Delete the heading if empty. -->
-
