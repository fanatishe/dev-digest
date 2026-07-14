/**
 * DOMAIN ring — pure. The error vocabulary of this package, and nothing else: no
 * fetch, no env, no fs.
 *
 * Principle 4, "errors lead onward": never a bare 404. EVERY string below names the
 * next tool to call or the next command to run — `list_agents`, `get_findings`,
 * `run_agent_on_pr`, `get_conventions`, `./scripts/dev.sh`, or the DevDigest UI.
 * `errors.test.ts` asserts exactly that, message by message.
 */

/** A non-2xx from the DevDigest API, decoded from its `ApiErrorBody` envelope. */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

/** The API could not be reached at all (connection refused, DNS, timeout). */
export class ApiUnreachableError extends Error {
  constructor(
    readonly baseUrl: string,
    readonly cause?: unknown,
  ) {
    super(`DevDigest API unreachable at ${baseUrl}`);
    this.name = 'ApiUnreachableError';
  }
}

/**
 * An error whose `message` is already written FOR THE MODEL — actionable, naming the
 * next step. Tools surface it verbatim; they never leak a stack trace.
 */
export class ToolError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ToolError';
  }
}

// ---- The catalogue (§7) --------------------------------------------------------

export function apiDownMessage(baseUrl: string): string {
  return (
    `The DevDigest API is not running at ${baseUrl}. ` +
    `Start it with ./scripts/dev.sh from the repo root, then retry.`
  );
}

export function repoNotFoundMessage(repo: string, importedRepos: readonly string[]): string {
  const imported =
    importedRepos.length > 0 ? importedRepos.join(', ') : '(none — no repos are imported yet)';
  return (
    `Repository "${repo}" is not imported into DevDigest. Imported repos: ${imported}. ` +
    `Import it in the DevDigest UI (Repos → Add), then retry.`
  );
}

export function prNotFoundMessage(
  pr: string | number,
  repoFullName: string,
  openPrNumbers: readonly number[],
): string {
  const open =
    openPrNumbers.length > 0
      ? openPrNumbers.map((n) => `#${n}`).join(', ')
      : '(none — this repo has no open pull requests)';
  return (
    `Pull request ${pr} was not found in ${repoFullName}. Open PRs: ${open}. ` +
    `Check the number, or refresh the repo in the DevDigest UI.`
  );
}

export function prNotSyncedMessage(prNumber: number, repoFullName: string): string {
  return (
    `PR #${prNumber} in ${repoFullName} has not been synced into DevDigest yet (no local id). ` +
    `Open the repo in the DevDigest UI once to sync it, then retry.`
  );
}

export function agentNotFoundMessage(agent: string): string {
  return `Agent "${agent}" not found — call list_agents to see the available agents.`;
}

export function noAgentsMessage(): string {
  return (
    `No reviewer agents are configured. Seed them with \`cd server && pnpm db:seed\`, ` +
    `or create one in the DevDigest UI (Agents → New), then call list_agents again.`
  );
}

export function rateLimitedMessage(): string {
  return (
    `Reviews are rate-limited to 10/minute. Wait a minute and retry — ` +
    `or call get_findings to read a review you already paid for.`
  );
}

export function noCompletedReviewMessage(pr: string | number, repoFullName: string): string {
  return (
    `PR #${pr} in ${repoFullName} has no completed review yet. ` +
    `Call run_agent_on_pr (repo, pr, agent) to run one — pick an agent with list_agents.`
  );
}

export function noConventionsMessage(repoFullName: string): string {
  return (
    `DevDigest has not extracted any coding conventions for ${repoFullName} yet. ` +
    `Extract them in the DevDigest UI (Repo → Conventions → Extract) — it is a paid model call, ` +
    `so get_conventions never starts one — then call get_conventions again.`
  );
}

/**
 * The TIMEOUT path of `run_agent_on_pr`. Returned with `isError: false` ON PURPOSE:
 * the model call is already in flight and already billed, an error result invites a
 * retry, and a retry here is a SECOND bill. The run is not cancelled either —
 * cancelling burns the spend and returns nothing.
 */
export function runTimeoutMessage(
  runId: string,
  repo: string,
  pr: string | number,
  timeoutMs: number,
): string {
  return (
    `Review ${runId} is still running after ${Math.round(timeoutMs / 1000)}s. It has NOT been ` +
    `cancelled and the model call is already paid for. Do NOT call run_agent_on_pr again — that ` +
    `starts a second billable review. Wait a minute, then call ` +
    `get_findings(repo:"${repo}", pr:${JSON.stringify(pr)}, run_id:"${runId}").`
  );
}

/**
 * A run that is STILL RUNNING, reached from a READ path (`get_findings` with a `run_id`
 * whose review has not landed yet). Same do-not-re-run guarantee as `runTimeoutMessage`,
 * but it makes NO elapsed-time claim: the caller may be asking seconds after the run
 * started, and "still running after 180s" would be a lie.
 *
 * This message exists because the obvious fallback — `noCompletedReviewMessage`, which
 * says "call run_agent_on_pr to run one" — would REVERSE the guardrail the timeout path
 * just issued and bill the user a second time for a review already in flight. Before
 * writing any onward message, ask which tool it points at and what that tool costs.
 */
export function runStillRunningMessage(runId: string, repo: string, pr: string | number): string {
  return (
    `Review ${runId} has not finished yet, so it has no findings to read. It has NOT been ` +
    `cancelled and the model call is already paid for. Do NOT call run_agent_on_pr again — that ` +
    `starts a second billable review. Wait a minute, then call ` +
    `get_findings(repo:"${repo}", pr:${JSON.stringify(pr)}, run_id:"${runId}").`
  );
}

/** A run that reached a terminal `failed` / `cancelled` state — nothing was persisted. */
export function runFailedMessage(runId: string, status: string, error?: string | null): string {
  const because = error ? ` (${error})` : '';
  return (
    `Review run ${runId} ended as "${status}"${because} and produced no findings. ` +
    `Check the run in the DevDigest UI, then call run_agent_on_pr again once the cause is fixed.`
  );
}

/**
 * `get_blast_radius`'s whole body. The engine exists (`repoIntel.getBlastRadius()` in
 * the server's repo-intel module) and so does the `BlastRadius` contract — what is
 * missing is an HTTP route. That is the exercise, stated precisely.
 */
export const NOT_IMPLEMENTED_BLAST = [
  'get_blast_radius is not implemented yet — this message is the tool, deliberately.',
  '',
  'Why: DevDigest computes a blast radius internally (repoIntel.getBlastRadius(), plus the',
  'BlastRadius contract in the shared contracts package), but the API exposes NO HTTP route for',
  'it — and this MCP server reaches DevDigest over HTTP only. It cannot call the engine.',
  '',
  "To finish it: (1) add a route in the API's repo-intel module (modules/repo-intel/routes.ts),",
  '(2) add getBlastRadius() to ApiPort + api/http-client.ts, (3) add a service method and swap',
  "this handler's body. The tool name, description and input schema do not change.",
  '',
  'Meanwhile: call get_findings for what the reviewer already flagged on this PR.',
].join('\n');

/** Maps a decoded `ApiError` onto an onward-leading message. */
export function apiErrorMessage(err: ApiError, baseUrl: string): string {
  if (err.status === 429) return rateLimitedMessage();
  return (
    `The DevDigest API at ${baseUrl} returned ${err.status} (${err.code}): ${err.message}. ` +
    `Check the API log in the terminal running ./scripts/dev.sh, then retry.`
  );
}

/** Normalizes any thrown value into a model-facing `ToolError`. */
export function toToolError(err: unknown, baseUrl: string): ToolError {
  if (err instanceof ToolError) return err;
  if (err instanceof ApiUnreachableError) return new ToolError(apiDownMessage(baseUrl));
  if (err instanceof ApiError) return new ToolError(apiErrorMessage(err, baseUrl));
  const message = err instanceof Error ? err.message : String(err);
  return new ToolError(
    `Unexpected failure talking to DevDigest: ${message}. ` +
      `Confirm the stack is up (./scripts/dev.sh), then retry.`,
  );
}
