import type { PrHistory, PrHistoryItem } from '@devdigest/shared';
import {
  HISTORY_MAX_ITEMS,
  MERGE_COMMIT_PR_RE,
  NOTES_MAX_FILES_NAMED,
  SQUASH_MERGE_PR_RE,
} from './blast.constants.js';

/**
 * PR History — the pure builder. NO LLM, NO I/O, NO container, NO Drizzle, NO
 * Fastify. "Which merged PRs last touched the files this PR changes?"
 *
 * The data source is the CLONE, not the GitHub API and not a table: when a PR is
 * squash-merged, GitHub appends `(#482)` to the commit subject, so `git log --
 * <file>` yields the PR number, title, author and merge date for free. That is
 * why this costs nothing and works offline.
 *
 * `notes` is DERIVED, never generated. It states which of the current PR's files
 * that prior PR also touched — a fact we can point at in the log. A model could
 * write something more insightful here ("this established the router you're
 * hooking into"), but it would be a paid call per page view, and an unfalsifiable
 * claim on a card whose whole value is that every line of it is grounded.
 */

/** The shape the route passes in — structurally satisfied by a `GitCommit`. */
export interface HistoryInputCommit {
  sha: string;
  /** The commit SUBJECT (first line). */
  message: string;
  /** The commit BODY — where a merge commit keeps the PR title. */
  body?: string;
  author: string;
  date: string;
  /** Which of the CURRENT PR's changed files this commit touched. */
  file: string;
}

function toPrNumber(raw: string | undefined): number | null {
  if (!raw) return null;
  const n = Number(raw);
  return Number.isSafeInteger(n) && n > 0 ? n : null;
}

/** What we know about one of THIS repo's own PRs (from `pull_requests`). */
export interface KnownPrRef {
  title: string;
  branch: string;
}

/**
 * Recover a PR from a commit, covering BOTH of GitHub's merge strategies.
 *
 * `title` is what git alone can tell us; `title` is null when git has nothing better than
 * the branch name to offer (a merge commit with an empty body). `headRef` is the
 * `owner/branch` a merge commit names — the corroboration signal (see below).
 *
 * Returns null for a commit that no PR produced (a direct push, a rebase).
 */
function parseMergedPr(
  message: string,
  body: string | undefined,
): { number: number; title: string | null; subject: string; headRef: string | null } | null {
  const subject = message.split('\n')[0]?.trim() ?? '';

  // 1. Squash merge — `Add ioredis client for session cache (#356)`. The subject IS the
  //    title, so this branch always has a strong title (and no head ref).
  const squash = SQUASH_MERGE_PR_RE.exec(subject);
  if (squash) {
    const number = toPrNumber(squash[1]);
    const title = subject.replace(SQUASH_MERGE_PR_RE, '').trim();
    if (number && title.length > 0) return { number, title, subject, headRef: null };
    return null;
  }

  // 2. Merge commit — `Merge pull request #5 from owner/branch`; the PR title, if any,
  //    is the body's first non-empty line. An EMPTY body yields `title: null` — the
  //    subject is only the branch name, so we mark it weak and let the caller enrich it.
  const merge = MERGE_COMMIT_PR_RE.exec(subject);
  if (merge) {
    const number = toPrNumber(merge[1]);
    if (!number) return null;
    const title =
      (body ?? '')
        .split('\n')
        .map((l) => l.trim())
        .find((l) => l.length > 0) ?? null;
    return { number, title, subject, headRef: merge[2] ?? null };
  }

  return null;
}

/**
 * Does this commit really belong to THIS repo's PR `known`, and not merely share its
 * number?
 *
 * A bare number from git log is NOT this repo's namespace: on a fork, the inherited
 * upstream history carries upstream's PR numbers, and fork numbering restarts at #1 —
 * so "#5" in the log and "#5" on this repo are usually two unrelated PRs. Before the
 * number is used for anything namespace-sensitive (a /pull/N link, self-exclusion,
 * title enrichment), it must be corroborated against what we know about OUR PR N:
 *
 *  · a MERGE commit names its head ref — `Merge pull request #5 from owner/branch` —
 *    so it corroborates iff that ref's branch is OUR PR's branch;
 *  · a SQUASH commit's subject IS the PR title at merge time — so it corroborates iff
 *    it equals OUR PR's title exactly.
 *
 * Conservative on purpose: an edited squash subject or a renamed branch fails the gate
 * and the entry degrades to a commit link — less convenient, never wrong.
 */
function corroborates(
  parsed: { title: string | null; headRef: string | null },
  known: KnownPrRef,
): boolean {
  if (parsed.headRef !== null) {
    if (known.branch.length === 0) return false;
    // The ref is `owner/branch` (and the branch itself may contain slashes), so match
    // the exact ref or an `…/<branch>` suffix — never a substring.
    return parsed.headRef === known.branch || parsed.headRef.endsWith(`/${known.branch}`);
  }
  return parsed.title !== null && parsed.title === known.title;
}

/** Grounded, deterministic — it only ever names files we saw in the log. */
function deriveNotes(overlap: readonly string[], changedCount: number): string {
  if (overlap.length === 0) return '';
  const named = overlap.slice(0, NOTES_MAX_FILES_NAMED).join(', ');
  const rest = overlap.length - NOTES_MAX_FILES_NAMED;
  const tail = rest > 0 ? `${named}, +${rest} more` : named;
  const count = `${overlap.length} of the ${changedCount} file${changedCount === 1 ? '' : 's'}`;
  return `Touched ${count} this PR changes: ${tail}`;
}

/**
 * Fold per-file commit logs into one entry per prior PR.
 *
 * `commits` may (and will) contain the same commit once per file it touched —
 * that repetition IS the overlap signal, so we group by PR number and collect
 * the distinct files rather than deduping the commits away.
 */
export interface BuildPrHistoryOpts {
  /**
   * The PR being viewed. Self-exclusion is CORROBORATED, not by bare number: on a fork,
   * upstream's PR shares the current PR's number without being the same PR, and hiding
   * it would drop real history.
   */
  currentPr?: { number: number } & KnownPrRef;
  /**
   * This repo's imported PRs, `pr_number → {title, branch}`. Used for two things, both
   * gated on `corroborates()`: confirming a number as this repo's own (→ the client may
   * render a /pull/N link), and supplying a title when a merge commit's body was empty.
   */
  importedPrs?: ReadonlyMap<number, KnownPrRef>;
}

export function buildPrHistory(
  commits: readonly HistoryInputCommit[],
  changedFiles: readonly string[],
  opts: BuildPrHistoryOpts = {},
): PrHistory {
  const changed = new Set(changedFiles);

  interface Acc {
    item: Omit<PrHistoryItem, 'files_overlap' | 'notes'>;
    files: Set<string>;
  }
  const byPr = new Map<number, Acc>();

  for (const c of commits) {
    // Only files this PR actually changes count as overlap. A commit reaching us
    // for some other path would inflate the overlap with an unrelated file.
    if (!changed.has(c.file)) continue;

    const parsed = parseMergedPr(c.message, c.body);
    // No PR produced this commit (a direct push, a rebase) → not attributable. Skip it
    // rather than invent a number.
    if (!parsed) continue;

    // A PR does not appear in its own history — but only when the commit is REALLY this
    // PR's merge, not an upstream PR that happens to share the number.
    if (
      opts.currentPr &&
      parsed.number === opts.currentPr.number &&
      corroborates(parsed, opts.currentPr)
    ) {
      continue;
    }

    const existing = byPr.get(parsed.number);
    if (existing) {
      existing.files.add(c.file);
      // Keep the most recent sighting's date — the same squash commit reached us
      // once per file, so this is stable, but a rebase can duplicate a subject.
      if (c.date > existing.item.merged_at) existing.item.merged_at = c.date;
      continue;
    }

    // Is this number really OURS? Only a corroborated match may confirm the number
    // (→ /pull/N link) or lend its GitHub title to an empty-bodied merge commit.
    const known = opts.importedPrs?.get(parsed.number);
    const confirmed = known !== undefined && corroborates(parsed, known);

    // Title precedence: what git recorded (squash subject or merge body) → the
    // CORROBORATED imported PR's GitHub title → the raw merge subject (a branch name,
    // the last resort).
    const title = parsed.title ?? (confirmed ? known.title : null) ?? parsed.subject;

    byPr.set(parsed.number, {
      item: {
        pr_number: parsed.number,
        title,
        merged_at: c.date,
        author: c.author,
        // The namespace-free identifier — what the client links when the number is
        // NOT confirmed. A commit link works on forks; a /pull/N link lies on them.
        merge_sha: c.sha,
        number_confirmed: confirmed,
      },
      files: new Set([c.file]),
    });
  }

  const history: PrHistoryItem[] = [...byPr.values()]
    .map(({ item, files }) => {
      const files_overlap = [...files].sort();
      return { ...item, files_overlap, notes: deriveNotes(files_overlap, changed.size) };
    })
    // Most recently merged first — the card is a "what happened here lately".
    .sort((a, b) => (a.merged_at < b.merged_at ? 1 : a.merged_at > b.merged_at ? -1 : 0))
    .slice(0, HISTORY_MAX_ITEMS);

  return { history };
}
