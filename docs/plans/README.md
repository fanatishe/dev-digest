# Development Plans

A **Development Plan** is the handoff contract between the `planner` agent and the
`implementer` agents. `planner` writes one here (`<YYYY-MM-DD>-<slug>.md`); one or more
`implementer` agents each execute a single work package from it, in parallel.

The load-bearing parts:

- **`Owns` globs** — each work package declares the paths it may write, disjoint from every
  other WP. This is what makes parallel implementers safe: an implementer that writes
  outside its `Owns` has failed, even if the code is good.
- **`Surface:`** — `server` · `reviewer-core` · `client` · `shared` · `e2e`. Exactly one per
  WP. It selects the implementer's closed skill set (backend vs frontend), so a WP that
  spans both must be split into a server WP and a client WP.
- **WP0 — Foundation** — the serial work package holding everything parallel implementers
  would otherwise collide on: the Zod contracts (both the canonical copy and the client's
  vendored one), the DB migration, and the shared wiring (`modules/index.ts`,
  `platform/container.ts`). It lands first; those paths are then **LOCKED** for every other
  WP. An implementer that needs a LOCKED file reports `BLOCKED` rather than editing it.

Plans are committed, so they can be reviewed in a PR and read by an implementer with a
fresh context window. If a fact is not in the plan, it does not exist as far as the
implementer is concerned.
