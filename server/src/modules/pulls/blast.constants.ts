/**
 * Blast Radius / PR History constants.
 *
 * Deliberately separate from `classifier.constants.ts` (Smart Diff's) — these are
 * read-time limits on how much of the index and of `git log` we are willing to
 * walk for ONE page render, not classification thresholds.
 *
 * `MAX_CALLERS_PER_SYMBOL` is NOT redefined here. It lives in
 * `repo-intel/constants.ts` because the facade enforces it when it reads the
 * index; a second copy here would be the same number in two places, free to
 * drift. Importing the constant across modules is the sanctioned tier-1 case
 * (see server/INSIGHTS.md) — importing a service or a table would not be.
 */

// ---- PR History (`GET /pulls/:id/history`) --------------------------------

/**
 * `GitClient.log()` runs `git log -- <file>` with NO `maxCount` (adapters/git/
 * simple-git.ts) — it walks a file's ENTIRE history and materialises every
 * commit. That is the one real performance trap in this feature, so the fan-out
 * is bounded on both axes: how many files we ask about, and how far back we look
 * in each. A PR touching 60 files must not fire 60 unbounded git-log processes.
 */
export const HISTORY_MAX_FILES = 20;
export const HISTORY_MAX_COMMITS_PER_FILE = 50;

/** Prior PRs surfaced on the card, most recently merged first. */
export const HISTORY_MAX_ITEMS = 5;

/**
 * GitHub has TWO merge strategies and they leave completely different commits behind.
 * Supporting only one silently returns "no prior PRs" on every repo that uses the other
 * — which is exactly what happened when this shipped squash-only.
 *
 * 1. SQUASH merge → the PR number is appended to the subject:
 *      `Add ioredis client for session cache (#356)`
 *    Anchored to the END of the subject, so a `(#123)` mentioned mid-message (an issue
 *    reference) is not mistaken for the marker.
 *
 * 2. MERGE commit → the subject names the branch and the PR TITLE goes in the BODY:
 *      subject: `Merge pull request #5 from fanatishe/feat/new_agents`
 *      body:    `Add the new agents`
 *    Hence `GitCommit.body` — without it the best title available is a branch name.
 *
 * A commit matching NEITHER (a direct push, a rebase) is not attributable to a PR and is
 * skipped rather than guessed at.
 */
export const SQUASH_MERGE_PR_RE = /\(#(\d+)\)\s*$/;
/**
 * Group 1 = the PR number; group 2 = the HEAD REF (`owner/branch`). The ref is the
 * corroboration signal: `pull_requests.branch` for this repo's own PR #N must match it,
 * or the number belongs to some OTHER repo's numbering (a fork's upstream, typically).
 */
export const MERGE_COMMIT_PR_RE = /^Merge pull request #(\d+) from (\S+)/;

/** Overlapping files named inline in the derived `notes` before eliding. */
export const NOTES_MAX_FILES_NAMED = 3;
