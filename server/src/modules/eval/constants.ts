import type { Provider } from '@devdigest/shared';

/**
 * Eval module constants (pure — domain-core ring; no I/O).
 *
 * These are the fixed knobs the eval pipeline runs on. None of them is a shared
 * contract: they configure the SERVER's eval behaviour and belong to WP-C.
 */

/**
 * The fixed, neutral host system prompt for a SKILL eval case (AC-19).
 *
 * A skill case is scored in isolation: instead of an agent's prompt we run
 * `reviewPullRequest` with this minimal, agent-independent reviewer prompt and
 * inject ONLY the skill's body as the sole skill. Keeping it a constant (not a
 * contract, and not derived from any agent) is what makes a skill's metrics a
 * property of the SKILL, not of whichever agents happen to exist.
 *
 * The plan's older name `EVAL_HOST_SYSTEM_PROMPT` is dropped in favour of this
 * single name (spec Open questions, resolved 2026-07-18).
 */
export const EVAL_SKILL_HOST_PROMPT =
  'You are a code reviewer. Review the diff below and report only issues that are ' +
  'directly supported by the changed lines, citing the file and line for each. ' +
  'Apply the attached rubric/skill exactly as written. Do not invent issues that ' +
  'the diff does not evidence.';

/**
 * Workspace-default provider/model for a SKILL host run (AC-19). Mirrors the
 * seed's `DEFAULT_PROVIDER`/`DEFAULT_MODEL` (`db/seed.ts`) — the studio's
 * out-of-the-box default. Agent cases use the agent VERSION's own provider/model
 * instead; only the (host-config) skill path reads these.
 */
export const EVAL_SKILL_HOST_PROVIDER: Provider = 'openrouter';
export const EVAL_SKILL_HOST_MODEL = 'deepseek/deepseek-v4-flash';

/** Default reproducibility window (N runs) — reliability threshold is >= 0.8. */
export const DEFAULT_REPRO_WINDOW = 5;

/** Default number of executions for an ad-hoc "Run N×" (AC-13). */
export const DEFAULT_RUN_TIMES = 1;

/** Default `GET /eval/cases/:id/runs` page size (drives the ReproRateBadge). */
export const DEFAULT_RUNS_LIMIT = 5;

/** Default date-range window for dashboards/batches when `from`/`to` are omitted (AC-29). */
export const DEFAULT_RANGE_DAYS = 30;

/** Reliability threshold: a case reproduces reliably iff `ratio >= 0.8` (AC-14). */
export const REPRO_RELIABLE_THRESHOLD = 0.8;
