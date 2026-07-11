# API Contract Reviewer — skills experiment (runbook)

Goal: prove that attaching skills to an agent changes its behaviour. Run the **API
Contract Reviewer** on a PR that breaks a public API contract — **without** skills it
misses the break; **with** skills it flags it and comments.

Everything below runs locally. It needs an LLM key + a GitHub token (Settings or
`server/.env`). Claude/you only *built* this; you (the operator) run the steps.

## 0. What already exists (seeded)

`server/src/db/seed.ts` already creates, idempotently:

- The **API Contract Reviewer** agent (`provider: openrouter`, `model:
  deepseek/deepseek-v4-flash`, prompt mirrored in
  `docs/agent-prompts/api-contract-reviewer.md`).
- Four contract skills linked to it in order: **breaking-change**, **response-schema**,
  **semver-discipline**, **deprecation-policy**.

Re-seed anytime (safe, insert-if-missing): `cd server && pnpm db:seed`.

The same four skill bodies live as importable markdown under
[`docs/skills/api-contract/`](./skills/api-contract) so you can exercise the **import**
workflow (acceptance criterion: *create at least one skill via import*).

## 1. Import at least one skill (workflow demo)

1. **Skills Lab → Skills → Add skill → From file.**
2. Choose `docs/skills/api-contract/breaking-change.md`.
3. The importer shows an extract-only **preview** (nothing saved yet) — the name is
   derived from the file's `# breaking-change` heading. Edit if you like, then
   **Create skill**. (If a seeded `breaking-change` already exists, import under a new
   name like `breaking-change-imported` to avoid confusion.)

## 2. Confirm the agent + its skills

**Skills Lab → Agents → API Contract Reviewer → Skills tab.** You should see the four
skills attached. If you imported a fresh one, attach it here too (checkbox = link).

## 3. Pick / create a breaking PR

Use any imported repo. The PR must **rename a response field** or **change a route
signature**. Minimal example (rename a response field):

```diff
- interface UserResponse { id: string; name: string; email?: string }
+ interface UserResponse { id: string; fullName: string; email?: string }   // renamed name → fullName
```

Import the repo (Add repository), then **Import pull requests** to pull that PR + its
diff into DevDigest.

## 4. Run A — WITHOUT skills (baseline)

1. On the agent's **Skills tab**, temporarily **detach all four skills** (uncheck them).
   *(Alternative: clone the agent as "API Contract Reviewer (no skills)" and run that,
   so you don't have to re-link afterwards.)*
2. Open the PR → **Review** → run the API Contract Reviewer.
3. Expected: the review does **not** flag the rename as a breaking change (or only
   mentions it weakly). In **Run Details → live log** you should NOT see a
   `Skills:` line.

## 5. Run B — WITH skills

1. Re-attach the four skills on the **Skills tab** (order 0–3).
2. Re-run the review on the same PR.
3. Expected: the review flags the renamed field as a **breaking change** (CRITICAL) and
   leaves a grounded comment citing `file:line`.

## 6. Verify the acceptance criteria

- **AC #7 — runs on any PR:** both runs complete with findings.
- **AC #8 — logs:** open **Run Details → live log** for Run B and confirm it contains
  the exact line:

  ```
  Skills: 4 skill(s) attached to prompt
  ```

  (Emitted by `server/src/modules/reviews/run-executor.ts`.)
- **AC #9 — Skill Dynamics:** in **Run Details → Trace**, expand the **Skill Dynamics**
  section. It lists each attached skill by `name · vN` and shows the **exact body** that
  was injected for this run (snapshotted at run time, so it's stable even if you later
  edit the skill).

## 7. Compare

Side-by-side, Run B should surface the breaking-change finding that Run A missed —
demonstrating that skills materially change the agent's output.
