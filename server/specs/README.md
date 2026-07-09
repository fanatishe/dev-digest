# server/specs — contracts & API specs

Authoritative shapes: the Zod contracts (`src/vendor/shared/contracts/*`), route
request/response specs, and per-lesson feature specs (L01–L08).

The code in `src/vendor/shared` is the runtime source of truth; docs here explain
*intent* and cross-route invariants that a schema alone doesn't capture.

`server/CLAUDE.md` points here with "Read when… adding or changing an API route".
