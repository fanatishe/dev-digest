/**
 * APPLICATION ring — the WRITE side (`run_agent_on_pr`) and the review read
 * (`get_findings`).
 *
 * Constraints (from the plan, not negotiable — and every one of them is load-bearing):
 *  - `runOnPr()` is the WHOLE flow: resolve repo → resolve pr → resolve agent to a
 *    **uuid** → `startReview()` **exactly once** → `waitForRun()` → `listReviews()`.
 *  - `POST /pulls/:id/review` is FIRE-AND-FORGET: its `reviews` array is always `[]`.
 *    Findings come only from `listReviews()` after the run leaves `running`. Reading
 *    them off the POST response is the obvious bug here and it fails SILENTLY, with an
 *    empty review, on a review the user paid for.
 *  - Filter `kind === 'review' && run_id === runId` — `ReviewRecord.kind` is
 *    `'summary' | 'review'`, and a summary row would otherwise slip through as if it
 *    were the review.
 *  - TIMEOUT: do NOT cancel, do NOT re-POST. Return `status: 'running'` with
 *    `runTimeoutMessage(...)` in `next` — the model call is already billed, and an error
 *    result invites a retry that bills a second time.
 *  - `waitForRun` takes `sleep` as an injected argument so tests don't wait 3 minutes.
 *  - It receives the `ApiPort`; it never constructs one.
 */
import type { McpConfig } from '../ports.js';
import {
  ToolError,
  noCompletedReviewMessage,
  runFailedMessage,
  runStillRunningMessage,
  runTimeoutMessage,
  toToolError,
} from '../errors.js';
import { projectFindings, truncationHint } from '../format.js';
import type { ApiPort } from '../ports.js';
import { resolveAgent, resolveTarget } from '../resolve.js';
import type {
  Agent,
  Detail,
  FindingsResult,
  Repo,
  ReviewRecord,
  RunOnPrResult,
  SyncedPr,
} from '../types.js';
import { type Sleep, waitForRun } from '../wait.js';

export interface RunOnPrInput {
  repo: string;
  pr: string | number;
  agent: string;
}

export interface GetFindingsInput {
  repo: string;
  pr: string | number;
  runId?: string;
  detail: Detail;
  limit: number;
}

/**
 * `run_agent_on_pr` takes no `limit` (P2 — the argument list stays minimal), so its
 * findings are capped at the same default `get_findings` uses, with a hint pointing at
 * `get_findings` for the rest. A 200-finding review would otherwise dump tens of
 * thousands of tokens into the context in a single tool result.
 */
export const RUN_FINDINGS_LIMIT = 20;

/** The real timer. Injectable — see the constructor; `wait.ts` itself imports no timer. */
const realSleep: Sleep = (ms) => new Promise<void>((resolve) => setTimeout(resolve, ms));

export class ReviewService {
  constructor(
    private readonly api: ApiPort,
    private readonly config: McpConfig,
    private readonly sleep: Sleep = realSleep,
  ) {}

  /** create + wait + collect, in ONE call (P1 — outcome, not operation). */
  async runOnPr(input: RunOnPrInput): Promise<RunOnPrResult> {
    try {
      return await this.doRunOnPr(input);
    } catch (err) {
      throw toToolError(err, this.config.apiUrl);
    }
  }

  /** Read-only. Defaults to the latest completed review for the PR. Costs nothing. */
  async getFindings(input: GetFindingsInput): Promise<FindingsResult> {
    try {
      return await this.doGetFindings(input);
    } catch (err) {
      throw toToolError(err, this.config.apiUrl);
    }
  }

  // ---- run_agent_on_pr (§5.2) ----------------------------------------------------

  private async doRunOnPr({ repo, pr, agent }: RunOnPrInput): Promise<RunOnPrResult> {
    // Resolve EVERYTHING before spending anything. In particular the agent: `agents.id`
    // is a `uuid` column while `RunRequest.agentId` is a bare `z.string()`, so a NAME
    // reaches Postgres as `invalid input syntax for type uuid` → a 500, not a clean 404.
    const target = await resolveTarget(this.api, repo, pr);
    const agentRow = await resolveAgent(this.api, agent);

    // ---- THE ONE BILLABLE CALL. Exactly once per invocation. -----------------------
    // No retry loop, no cancel-and-restart: every extra POST here is another model call
    // and another bill (server/INSIGHTS.md — "check-then-act on a billable job is a
    // recurring bill"). If this throws, it propagates; it is never re-issued.
    const started = await this.api.startReview(target.pr.id, agentRow.id);

    // `noUncheckedIndexedAccess` is on, and it is right to be: an accepted POST that
    // started no run is not a review with no findings, it is an anomaly.
    const run = started.runs[0];
    if (!run) {
      throw new Error(
        'the review request was accepted but DevDigest started no run for it (no run_id returned)',
      );
    }
    const runId = run.run_id;

    const waited = await waitForRun(this.api, target.pr.id, runId, {
      pollMs: this.config.pollIntervalMs,
      timeoutMs: this.config.runTimeoutMs,
      firstDelayMs: this.config.firstPollDelayMs,
      sleep: this.sleep,
    });
    const costUsd = waited.run?.cost_usd ?? null;

    // ---- TIMEOUT — the money rule (§6) ---------------------------------------------
    // The run is NOT cancelled (the model call is in flight and already billed;
    // cancelling burns the spend and returns nothing) and NOT re-POSTed. The caller
    // returns this with `isError: false` on purpose: an error result invites a retry,
    // and a retry here is a SECOND BILL.
    if (waited.status === 'timeout') {
      return {
        ...this.emptyRun(runId, agentRow, costUsd),
        status: 'running',
        next: runTimeoutMessage(runId, repo, pr, this.config.runTimeoutMs),
      };
    }

    if (waited.status !== 'done') {
      return {
        ...this.emptyRun(runId, agentRow, costUsd),
        status: waited.status,
        next: runFailedMessage(runId, waited.status, waited.run?.error ?? null),
      };
    }

    // Findings come from HERE and nowhere else — `started.reviews` is ALWAYS `[]`.
    const reviews = await this.api.listReviews(target.pr.id);
    const review = this.reviewsOf(reviews).find((r) => r.run_id === runId);

    // Done, but nothing persisted for this run. Deliberately NOT an onward "run it
    // again" message: the run completed and was billed, so the one thing we must not do
    // is talk the model into paying for it twice.
    if (!review) return { ...this.emptyRun(runId, agentRow, costUsd), status: 'done' };

    const findings = projectFindings(review.findings, 'concise', RUN_FINDINGS_LIMIT);
    return {
      status: 'done',
      run_id: runId,
      agent: agentRow.name,
      verdict: review.verdict,
      score: review.score,
      summary: review.summary,
      findings,
      total_findings: review.findings.length,
      cost_usd: costUsd,
      next: truncationHint(findings.length, review.findings.length, 'findings', 'get_findings'),
    };
  }

  /** The shape of a run that produced no findings — timeout, failure, or an empty done. */
  private emptyRun(runId: string, agent: Agent, costUsd: number | null): Omit<RunOnPrResult, 'status'> {
    return {
      run_id: runId,
      agent: agent.name,
      verdict: null,
      score: null,
      summary: null,
      findings: [],
      total_findings: 0,
      cost_usd: costUsd,
      next: null,
    };
  }

  // ---- get_findings (§5.3) -------------------------------------------------------

  private async doGetFindings({
    repo,
    pr,
    runId,
    detail,
    limit,
  }: GetFindingsInput): Promise<FindingsResult> {
    const target = await resolveTarget(this.api, repo, pr);

    // Already newest-first from the API. The `kind` filter is NOT optional: a `summary`
    // row is a different artifact with its own `run_id`, and taking `[0]` off an
    // unfiltered list would hand the model a summary and call it the review.
    const reviews = this.reviewsOf(await this.api.listReviews(target.pr.id));
    const review = runId ? reviews.find((r) => r.run_id === runId) : reviews[0];

    if (!review) {
      throw new ToolError(
        runId
          ? await this.missingRunMessage(target, runId, repo, pr)
          : noCompletedReviewMessage(pr, target.repo.full_name),
      );
    }

    const findings = projectFindings(review.findings, detail, limit);
    return {
      run_id: review.run_id,
      verdict: review.verdict,
      score: review.score,
      summary: review.summary,
      findings,
      total_findings: review.findings.length,
      next: truncationHint(findings.length, review.findings.length, 'findings', 'get_findings'),
    };
  }

  /**
   * A `run_id` with no review of this PR behind it. The message must be chosen with the
   * bill in mind, so we ask the (free, non-billable) runs endpoint what actually
   * happened rather than defaulting to "no review yet — run one":
   *
   *  - still running  → the do-NOT-re-run message. This is the common case (a caller
   *    handed us the run_id from a `run_agent_on_pr` that timed out). Telling it to
   *    start a review here would charge the user a second time for a review that is
   *    already in flight.
   *  - failed/cancelled → say so, with the run's own error; re-running is correct here,
   *    once the cause is fixed.
   *  - unknown run_id → it is not a run of this PR at all; the no-review message.
   */
  private async missingRunMessage(
    target: { repo: Repo; pr: SyncedPr },
    runId: string,
    repo: string,
    pr: string | number,
  ): Promise<string> {
    const run = (await this.api.listRuns(target.pr.id)).find((r) => r.run_id === runId);
    if (!run) return noCompletedReviewMessage(pr, target.repo.full_name);
    if (run.status === null || run.status === 'running') {
      // NOT runTimeoutMessage: this is a read path, and the run may have started seconds
      // ago — claiming "still running after 180s" would be false. Same money guarantee.
      return runStillRunningMessage(runId, repo, pr);
    }
    return runFailedMessage(runId, run.status, run.error);
  }

  /** `ReviewRecord.kind` is `'summary' | 'review'`. We only ever mean the review. */
  private reviewsOf(records: readonly ReviewRecord[]): ReviewRecord[] {
    return records.filter((r) => r.kind === 'review');
  }
}
