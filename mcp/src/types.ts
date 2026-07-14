/**
 * PORTS ring — the ONLY module in this package allowed to name `@devdigest/shared`,
 * and only ever on an `import type` line.
 *
 * Why: `mcp` pins zod ^3.25 (the SDK v1 peer dep) while `server` stays on ^3.24.
 * A VALUE import from the shared barrel would load a second zod instance into the
 * process and break `instanceof` in ways that surface far from the cause. Types are
 * erased at compile time, so `import type` costs nothing at runtime.
 *
 * Corollary: we do NOT re-`.parse()` API responses. The API already validated them
 * through `fastify-type-provider-zod` on the way out. Type them; don't re-parse them.
 */
import type {
  Agent,
  ApiErrorBody,
  ConventionCandidate,
  FindingRecord,
  PrMeta,
  Repo,
  ReviewRecord,
  ReviewRunResponse,
  RunSummary,
  Severity,
  Verdict,
} from '@devdigest/shared';

export type {
  Agent,
  ApiErrorBody,
  ConventionCandidate,
  FindingRecord,
  PrMeta,
  Repo,
  ReviewRecord,
  ReviewRunResponse,
  RunSummary,
  Severity,
  Verdict,
};

import type { AgentSummary, ConciseFinding, ConventionSummary, FullFinding } from './schemas.js';

/** A PR that exists locally: `PrMeta.id` is `nullish` in the contract, resolved here. */
export type SyncedPr = PrMeta & { id: string };

/** How much of a finding to project. Lives on `get_findings` and nowhere else. */
export type Detail = 'concise' | 'full';

/** A finding projected for the wire — never the raw `FindingRecord`. */
export type ProjectedFinding = ConciseFinding | FullFinding;

/** Terminal (or timed-out) state of a review run, as reported to the model. */
export type RunStatus = 'done' | 'failed' | 'cancelled' | 'running';

/**
 * Result of `run_agent_on_pr` (§5.2). `status: 'running'` is the TIMEOUT path — it is
 * NOT an error: the model call is already billed, and an error result invites a retry
 * that would bill again. `next` then points at `get_findings`.
 */
export interface RunOnPrResult {
  status: RunStatus;
  run_id: string;
  agent: string;
  verdict: Verdict | null;
  score: number | null;
  summary: string | null;
  findings: ProjectedFinding[];
  total_findings: number;
  cost_usd: number | null;
  next: string | null;
}

/** Result of `get_findings` (§5.3). `next` carries the truncation hint, if any. */
export interface FindingsResult {
  run_id: string | null;
  verdict: Verdict | null;
  score: number | null;
  summary: string | null;
  findings: ProjectedFinding[];
  total_findings: number;
  next: string | null;
}

/** Result of `get_conventions` (§5.4). */
export interface ConventionsResult {
  repo: string;
  conventions: ConventionSummary[];
  total: number;
  next: string | null;
}

/** Result of `list_agents` (§5.1) — `system_prompt` is stripped upstream, in format.ts. */
export interface AgentsResult {
  agents: AgentSummary[];
  total: number;
}
