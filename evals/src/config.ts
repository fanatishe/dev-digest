/**
 * All tunables in one place. No logic here — just the knobs the rest of the package reads.
 * Nothing in this module imports from another src module (it is the bottom of the dependency
 * graph): config knows nothing of runtime, scoring, or the SDK.
 */

// --- Models -----------------------------------------------------------------
// Cheap model under test by default; the judge is a stronger family to soften self-preference.
export const EVAL_MODEL = process.env.EVAL_MODEL ?? "claude-haiku-4-5";
export const EVAL_JUDGE_MODEL = process.env.EVAL_JUDGE_MODEL ?? "claude-sonnet-5";
export const MAX_TURNS = Number(process.env.EVAL_MAX_TURNS ?? "8");
// Internal per-run deadline (ms). Must sit BELOW vitest's testTimeout (240_000): a proxy/billing
// stall (OpenRouter 402 → Retry-After 120s, retried) can otherwise consume the whole test timeout
// as a HARD vitest kill, so the runner never regains control to classify the fault. Aborting at this
// deadline turns that hang into a returnable isError Result the runners can infra-skip. Keep the
// margin (≥30s under testTimeout) so the abort+teardown finishes before vitest fires.
export const RUN_DEADLINE_MS = Number(process.env.EVAL_RUN_DEADLINE_MS ?? "200000");

// --- Configuration tag ------------------------------------------------------
// "candidate" = artifact injected (normal). "baseline" = no artifact (benchmark lift baseline).
export const EVAL_CONFIG = process.env.EVAL_CONFIG ?? "candidate";
export const IS_BASELINE = EVAL_CONFIG === "baseline";

// --- Scoring / statistics thresholds ---------------------------------------
export const DEFAULT_THRESHOLD = 0.6; // judge score gate for a quality case
export const FLAKY_LOW = 0.2; // pass rate strictly inside (20%, 80%) is "flaky"
export const FLAKY_HIGH = 0.8;
export const COST_REGRESSION_RATIO = 1.25; // candidate mean tokens > 125% of baseline

// --- Tool allow-lists -------------------------------------------------------
// Subagent-spawning tool name varies by harness; count both.
export const SPAWN_TOOLS = new Set(["Task", "Agent"]);
// workflowTask runs against the LIVE repo with bypassPermissions — keep this read-only.
export const WORKFLOW_ALLOWED_TOOLS = ["Read", "Grep", "Glob", "Task", "Agent", "Skill"];
// NOTE: under permissionMode:"bypassPermissions" the SDK's `allowedTools` only auto-APPROVES —
// it does NOT restrict the toolset, so the list above can't keep the session read-only on its own.
// The real restrict knob is `disallowedTools`, which removes a tool from the model's context
// entirely ("cannot be used, even if they would otherwise be allowed"). We deny the mutating +
// shell tools so a workflow session (a) can't take real actions in the live repo, and (b) is
// forced to read files through the `Read` tool — otherwise the model runs `cat`/`grep` via Bash
// and the file-read trace the evals assert on is never recorded (a systemic source of flake).
// Scoped to workflowTask only: agentTask must keep Bash (e.g. architecture-reviewer runs dep-cruiser).
// NOTE the shell tool has TWO names across backends: the Agent SDK's native "Bash" and the
// OpenRouter/proxy path's "run_bash_command" (confirmed in CI traces). Deny both, or the read-only
// guard silently leaks the shell on the openrouter backend.
export const WORKFLOW_DISALLOWED_TOOLS = [
  "Bash",
  "run_bash_command",
  "Write",
  "Edit",
  "MultiEdit",
  "NotebookEdit",
];

// --- Infra-fault detection --------------------------------------------------
// A model call can fail for reasons that have NOTHING to do with the artifact under test: the
// OpenRouter account runs out of in-flight credit budget (HTTP 402), the gateway drops the socket,
// or the upstream returns 200-with-no-choices. On the Agent SDK path these surface as the assistant
// TEXT (e.g. "API Error: 402 … in_flight_budget_exhausted"), so the judge scores the empty output 0
// and a billing blip masquerades as a content regression. Match those signatures so the runners can
// SKIP such a case instead of failing it. Keep this list about transport/billing faults only —
// never add a model-behavior signal here, or a real regression would be silently skipped.
const INFRA_ERROR_RE =
  /API Error:|\b402\b|in_flight_budget_exhausted|exceed your available credits|rate.?limit|\b429\b|ECONNREFUSED|ECONNRESET|socket hang up|fetch failed|returned no choices|Retry-After/i;

/** True when a Result reflects a transport/billing fault, not a real artifact outcome. */
export function isInfraError(r: { text?: string; isError?: boolean }): boolean {
  return INFRA_ERROR_RE.test(r.text ?? "");
}

// --- Output verbosity -------------------------------------------------------
// Set EVAL_QUIET to suppress per-run trace/verdict spam during multi-run aggregation.
export const QUIET = Boolean(process.env.EVAL_QUIET);
