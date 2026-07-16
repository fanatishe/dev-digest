# client/specs — contracts & UI specs

The client consumes the shared Zod contracts (`src/vendor/shared/contracts/*`) —
the same shapes the server serializes. Document here the UI-facing contracts:
route params, query-key conventions, and per-lesson screen specs (L01–L08).

`client/CLAUDE.md` points here with "Read when… adding a page or data hook".

Author feature specs here with **`/spec-creator`** — file names `YYYY-MM-DD-<slug>.md`
(Spec ID `SPEC-NN` inside is the stable handle). A spec spanning more than one module goes
in the top-level `spec/` folder instead.
