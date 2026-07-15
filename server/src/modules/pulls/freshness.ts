/**
 * Clone-freshness decision for the Blast card — PURE. No I/O, no container, no Drizzle.
 *
 * The "Prior PRs" history and Blast Radius read the local clone / repo-intel index, which
 * only advances at import or on a manual resync — there is no poller. So after new PRs are
 * merged, those two cards go stale while the PR *list* (live from GitHub) stays correct.
 *
 * This decides, at request time, whether to kick off a BACKGROUND resync: the index is
 * stale iff the repo has PR activity newer than the last successful index. `updated_at` is
 * kept live-fresh by the PR-list sync and a merge bumps it, so the check is network-free
 * and self-terminating — once the resync completes and the index's `updatedAt` moves past
 * the PR activity, this stops firing.
 *
 * Deliberately conservative:
 *  · a DEGRADED / never-built index returns false — that needs a full index (its own badge
 *    + the manual Re-analyze button already cover it), not a resync-on-every-view;
 *  · a missing timestamp on either side returns false — we never resync on a guess.
 */
export interface CloneFreshnessInput {
  /** `repo_index_state.updatedAt` — when the index was last written. */
  indexUpdatedAt: Date | null;
  /** The index is degraded / has never been built. */
  indexDegraded: boolean;
  /** `max(pull_requests.updated_at)` for the repo — newest known GitHub activity. */
  latestPrActivityAt: Date | null;
}

export function shouldResyncClone({
  indexUpdatedAt,
  indexDegraded,
  latestPrActivityAt,
}: CloneFreshnessInput): boolean {
  if (indexDegraded) return false;
  if (!indexUpdatedAt || !latestPrActivityAt) return false;
  return latestPrActivityAt.getTime() > indexUpdatedAt.getTime();
}
