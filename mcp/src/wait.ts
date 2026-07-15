/**
 * APPLICATION ring — the wait (§6: POLL, not SSE).
 *
 * `run_agent_on_pr` is outcome-not-operation (P1): it starts a review and BLOCKS until
 * the run leaves `running`. This module is that block, and nothing else.
 *
 * Three deliberate properties:
 *
 *  1. **It takes the `ApiPort`** — never the HTTP client. Polling is orchestration, not
 *     I/O: the only thing this module knows how to do is ask the port for the runs of a
 *     PR and look at one row's `status`.
 *  2. **`sleep` is an INJECTED ARGUMENT.** There is no `setTimeout` here and no timer
 *     import. That is what lets the timeout test assert "gave up after N polls" in
 *     microseconds instead of three minutes — and it is why elapsed time is accumulated
 *     from the delays we asked for, rather than read off a clock a fake `sleep` never
 *     advances.
 *  3. **It NEVER cancels.** Not on timeout, not on anything. Cancelling a run whose
 *     model call is already in flight burns the spend and returns nothing (§6, the money
 *     rule). Giving up waiting is not the same as giving up the run — the caller turns a
 *     `'timeout'` into `status: 'running'` + "call get_findings later", not an error.
 *
 * Polling target: `GET /pulls/:id/runs`, whose `status` is an explicit DB-backed
 * terminal state (`running | done | failed | cancelled`) — unlike the SSE stream, which
 * makes you INFER completion from a log line and dies silently when the API restarts.
 */
import type { ApiPort } from './ports.js';
import type { RunSummary } from './types.js';

/** Injected so tests don't actually wait. The only "timer" this ring knows about. */
export type Sleep = (ms: number) => Promise<void>;

/**
 * How the wait ended. `'timeout'` is NOT a failure — the run is still going and is
 * already paid for; it is the caller's job to say so without inviting a retry.
 */
export type WaitOutcome = 'done' | 'failed' | 'cancelled' | 'timeout';

export interface WaitResult {
  readonly status: WaitOutcome;
  /** The last `RunSummary` we saw for this run — `null` if it never appeared. */
  readonly run: RunSummary | null;
}

export interface WaitOptions {
  /** Interval between polls after the first one. */
  readonly pollMs: number;
  /** Total budget. On expiry: give up WAITING, never cancel the run. */
  readonly timeoutMs: number;
  readonly sleep: Sleep;
  /** A run is never done in 200ms, so the first wait is longer. Defaults to `pollMs`. */
  readonly firstDelayMs?: number;
}

/**
 * `RunSummary.status` is a nullable free-form string in the contract. Anything that is
 * not `running` (and not absent) is terminal; an unrecognized terminal value is treated
 * as a failure, which is the safe direction — we stop waiting and say so, rather than
 * poll forever on a status we don't understand.
 */
function terminalOutcome(status: string): Exclude<WaitOutcome, 'timeout'> {
  if (status === 'done') return 'done';
  if (status === 'cancelled') return 'cancelled';
  return 'failed';
}

/** `null` status, or a run absent from the list, means STILL RUNNING — never "done". */
function isStillRunning(run: RunSummary | undefined): boolean {
  if (!run) return true;
  return run.status === null || run.status === 'running';
}

/**
 * Polls `listRuns(prId)` until `runId` leaves `running`, or the budget expires.
 *
 * A `runId` that is absent from the list is treated as **still running**, not as done:
 * the row is written by the same request that returned the id, but a read that races it
 * (or hits a replica) must not be mistaken for completion — that would return an empty
 * review for a review the user paid for.
 */
export async function waitForRun(
  api: ApiPort,
  prId: string,
  runId: string,
  options: WaitOptions,
): Promise<WaitResult> {
  const { pollMs, timeoutMs, sleep } = options;
  const firstDelayMs = options.firstDelayMs ?? pollMs;

  let elapsedMs = 0;
  let delayMs = firstDelayMs;
  let lastSeen: RunSummary | null = null;

  // Always polls at least once: the budget is checked AFTER a poll, so a tiny timeout
  // still answers "what is the run doing?" instead of timing out blind.
  for (;;) {
    await sleep(delayMs);
    elapsedMs += delayMs;

    const runs = await api.listRuns(prId);
    const run = runs.find((r) => r.run_id === runId);
    if (run) lastSeen = run;

    if (!isStillRunning(run) && run?.status != null) {
      return { status: terminalOutcome(run.status), run };
    }

    if (elapsedMs >= timeoutMs) return { status: 'timeout', run: lastSeen };

    delayMs = pollMs;
  }
}
