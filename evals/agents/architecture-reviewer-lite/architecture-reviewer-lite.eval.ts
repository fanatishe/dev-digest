import { describeAgent, runAgentCases } from "../../src/index.js";
// Deliberately reuses the strict variant's cases — same fixture, same practices. Only the injected
// agent artifact differs (architecture-reviewer-lite has the "cite the specific documented rule per
// finding" hard rule removed). That is what makes this pair a controlled A/B rather than two
// unrelated evals: pnpm eval:repeat both with labels and pnpm eval:delta them to see exactly which
// practice moved.
import type { AgentCase } from "../../src/index.js";
import { cases } from "../architecture-reviewer/architecture-reviewer.cases.js";

// The lite agent intentionally DROPS the "name the exact documented rule identifier per finding"
// hard rule, so it is expected to fail the rule-identifier practice by design. Grading it at the
// strict variant's threshold: 1.0 (every practice must pass) therefore makes it a guaranteed red —
// that one practice can never pass. Keep the practices verbatim (so eval:delta still isolates the
// citation practice's movement), but relax each affected case's gate to tolerate exactly the
// citation practice(s) failing: everything else (finds both violations, no fabrication, severity,
// verbatim evidence, gate verdict) must still hold. Cases without a citation practice stay at 1.0.
const CITATION = /documented rule identifier/i;
const liteCases: AgentCase[] = cases.map((c) => {
  const n = c.practices?.length ?? 0;
  const citation = c.practices?.filter((p) => CITATION.test(p)).length ?? 0;
  if (citation === 0 || c.threshold === undefined) return c;
  return { ...c, threshold: (n - citation) / n };
});

describeAgent("architecture-reviewer-lite", () => runAgentCases("architecture-reviewer-lite", liteCases));
