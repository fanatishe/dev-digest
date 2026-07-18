import type { AgentCase } from "../../src/index.js";
import { fixtureReader } from "../../src/index.js";

const fx = fixtureReader(import.meta.url);

const REVIEW_PROMPT = `Audit this diff against DevDigest's documented structural contracts.

${fx("checkout-service.diff")}`;

// A second real diff whose fs-import violation maps onto the DevDigest-SPECIFIC rule name
// `core-purity-no-io` (and whose skipped-`groundFindings()` gate is a reviewer-core code
// invariant) that a competent model will describe in prose but will not spontaneously name
// unless the agent forces a citation. This is
// the discriminating case for the strict-vs-lite A/B: both variants should FIND both problems,
// but only the strict variant (which keeps the "cite the exact documented rule per finding" hard
// rule) should reliably emit the identifier. The checkout diff's textbook violations don't
// discriminate — the model volunteers `service-no-fastify`/`service-no-external-sdk` either way,
// whereas `core-purity-no-io` (below) is a DevDigest-specific id a generic model won't name.
const REVIEWER_CORE_PROMPT = `Audit this diff against DevDigest's documented structural contracts.

${fx("reviewer-core-gate.diff")}`;

// A diff that violates NO documented rule (a pure local-variable rename inside a domain file, no
// new imports, no cross-layer edges). A grounded reviewer should report zero violations. This
// surfaces the COST of relaxing the citation rule: freed from "every finding must name a
// documented contract", the lite variant is more prone to fabricating a judgment/best-practice
// finding where the strict variant stays silent.
const BENIGN_PROMPT = `Audit this diff against DevDigest's documented structural contracts.

${fx("benign-refactor.diff")}`;

// Shared across the strict (architecture-reviewer) and relaxed (architecture-reviewer-lite)
// variants so the two agents are graded on the exact same task — the only thing that should
// move between the two runs is whether "cites the specific documented rule" keeps passing.
export const cases: AgentCase[] = [
  {
    name: "flags both violations in the checkout diff with severity and a citable rule",
    kind: "quality",
    prompt: REVIEW_PROMPT,
    practices: [
      "flags service.ts importing a type from 'fastify' as a violation of the rule that the application ring (service.ts) must not depend on Fastify/HTTP (`service-no-fastify`)",
      "flags service.ts constructing an external SDK client directly (`new Octokit()`) instead of resolving it via the DI container (`service-no-external-sdk`)",
      "names the specific documented rule identifier for EVERY finding (e.g. `service-no-fastify`, `service-no-external-sdk`) rather than describing the problem only in prose",
      "assigns a severity (critical/high/medium/low/info) to each finding",
      "quotes the offending line verbatim as evidence for each finding, not a paraphrase",
      "ends with an explicit advisory verdict (`request_changes`, `approve`, or `comment`) reflecting whether any critical/high findings exist — the agent is advisory and does NOT emit a PASS/FAIL gate",
    ],
    threshold: 1.0,
    maxTurns: 25,
  },
  {
    name: "does not fabricate an architecture finding for the out-of-scope security-shaped change",
    kind: "quality",
    prompt: REVIEW_PROMPT,
    practices: [
      "does not invent an architecture-contract violation for the optional `reply?: FastifyReply` parameter beyond the `service-no-fastify` import issue itself (no runtime bug/security finding fabricated as an architecture rule)",
      "stays scoped to structural/layering/DI findings and does not comment on naming, style, or test coverage",
    ],
    threshold: 1.0,
    maxTurns: 25,
  },
  {
    name: "cites the DevDigest-specific rule identifier for reviewer-core violations",
    kind: "quality",
    prompt: REVIEWER_CORE_PROMPT,
    practices: [
      "flags the `import { readFileSync } from 'node:fs'` added to reviewer-core/src/pipeline/run.ts as a violation (reviewer-core must do no I/O except the injected LLMProvider)",
      "flags that runPipeline now returns `deduped` directly, skipping the mandatory `groundFindings()` gate before emitting findings",
      "names the exact documented rule identifier `core-purity-no-io` for the fs-import finding rather than only describing it in prose",
      "for the skipped-gate finding, names the mandatory `groundFindings()` grounding gate and describes the invariant it enforces (findings must be grounded against the diff before emission) — this is a reviewer-core code invariant, not a lint rule, so a specific rationale rather than a depcruise id is what is required",
      "quotes the offending line verbatim as evidence for each finding, not a paraphrase",
      "ends with an explicit advisory verdict (`request_changes`, `approve`, or `comment`) reflecting whether any critical/high findings exist — the agent is advisory and does NOT emit a PASS/FAIL gate",
    ],
    threshold: 1.0,
    maxTurns: 25,
  },
  {
    name: "does not fabricate a documented-rule violation for a benign rename",
    kind: "quality",
    prompt: BENIGN_PROMPT,
    practices: [
      "reports no violations for the benign rename (or records only `info`-level, non-blocking observations) — it does not invent a critical/high/medium finding",
      "does not fabricate a documented-rule violation where the diff violates none of the checked rules",
      "the final advisory verdict is `approve` (no critical/high findings for a benign rename)",
    ],
    threshold: 1.0,
    maxTurns: 25,
  },
];
