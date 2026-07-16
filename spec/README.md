# spec — cross-module specs

This top-level folder holds **specs that span more than one module** — cross-module feature specs
and the product / architectural spec that describes how the whole system fits together.

**A spec that belongs to a single module lives in that module's own `specs/` folder**, not here:

| Spec scope | Where it lives |
|---|---|
| One module (`server` · `client` · `reviewer-core` · `mcp`) | `<module>/specs/YYYY-MM-DD-<slug>.md` |
| Two or more modules (a cross-module feature) | `spec/YYYY-MM-DD-<slug>.md` (here) |
| The product / architectural backbone | `spec/<slug>.md` (here — stable name, edited in place) |

Feature-spec **filenames carry the date** (like `docs/plans/`); the `Spec ID: SPEC-NN` inside is
the stable per-module handle that plans and tests reference.

> `e2e/specs/` is **not** a doc-spec folder — it holds executable `*.flow.json` test flows. Don't
> put prose specs there.

## Convention

Every spec opens with the same header line and describes **behavior and boundaries, not
implementation**:

```
# Spec: <feature> | Spec ID: SPEC-NN | Status: draft|approved|implemented
```

Acceptance criteria are written in **EARS** and numbered `AC-1`, `AC-2`, … A cross-module spec's
job is to pin the **contracts between modules** and the boundaries each side owns.

## Authoring

Specs are authored with the **`/spec-creator`** skill — it grounds itself in the real designs,
interviews you for anything ambiguous, and writes the spec into the right surface. See
[`.claude/skills/spec-creator/SKILL.md`](../.claude/skills/spec-creator/SKILL.md).
