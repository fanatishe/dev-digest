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

/**
 * Recover a PR from a commit, covering BOTH of GitHub's merge strategies.
 *
 * `title` is what git alone can tell us; `title` is null when git has nothing better than
 * the branch name to offer (a merge commit with an empty body). The caller decides what
 * to do with a null — enrich it from our own PR table, or fall back to `subject`. Keeping
 * the two apart is the whole point: a real title must never be overwritten by an
 * enrichment, and a branch name must never be shown when a real title is available.
 *
 * Returns null for a commit that no PR produced (a direct push, a rebase).
 */
function parseMergedPr(
  message: string,
  body: string | undefined,
): { number: number; title: string | null; subject: string } | null {
  const subject = message.split('\n')[0]?.trim() ?? '';

  // 1. Squash merge — `Add ioredis client for session cache (#356)`. The subject IS the
  //    title, so this branch always has a strong title.
  const squash = SQUASH_MERGE_PR_RE.exec(subject);
  if (squash) {
    const number = toPrNumber(squash[1]);
    const title = subject.replace(SQUASH_MERGE_PR_RE, '').trim();
    if (number && title.length > 0) return { number, title, subject };
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
    return { number, title, subject };
  }

  return null;
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
export function buildPrHistory(
  commits: readonly HistoryInputCommit[],
  changedFiles: readonly string[],
  excludePrNumber?: number,
  /**
   * `pr_number → title` from DevDigest's own imported PRs. Consulted ONLY when git could
   * not supply a title (a merge commit with an empty body). Never overrides a title git
   * already gave us — the merge body is the title as recorded at merge time, and is
   * preferred over whatever the PR is called now.
   */
  titleByNumber?: ReadonlyMap<number, string>,
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
    // A PR does not appear in its own history.
    if (excludePrNumber != null && parsed.number === excludePrNumber) continue;

    const existing = byPr.get(parsed.number);
    if (existing) {
      existing.files.add(c.file);
      // Keep the most recent sighting's date — the same squash commit reached us
      // once per file, so this is stable, but a rebase can duplicate a subject.
      if (c.date > existing.item.merged_at) existing.item.merged_at = c.date;
      continue;
    }

    // Title precedence: what git recorded (squash subject or merge body) → our imported
    // PR's GitHub title → the raw merge subject (a branch name, the last resort).
    const title = parsed.title ?? titleByNumber?.get(parsed.number) ?? parsed.subject;
    byPr.set(parsed.number, {
      item: {
        pr_number: parsed.number,
        title,
        merged_at: c.date,
        author: c.author,
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
