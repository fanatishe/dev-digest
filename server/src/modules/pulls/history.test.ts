import { describe, it, expect } from 'vitest';
import { buildPrHistory, type HistoryInputCommit } from './history.js';

const CHANGED = ['src/lib/redis.ts', 'src/middleware/ratelimit.ts', 'src/api/public/index.ts'];

function commit(over: Partial<HistoryInputCommit>): HistoryInputCommit {
  return {
    sha: 'abc',
    message: 'Add ioredis client for session cache (#356)',
    body: '',
    author: 'marisa.koch',
    date: '2026-02-02T10:00:00Z',
    file: 'src/lib/redis.ts',
    ...over,
  };
}

describe('buildPrHistory', () => {
  it('recovers the PR number, title, author and date from a squash-merge subject', () => {
    const { history } = buildPrHistory([commit({})], CHANGED);
    expect(history).toHaveLength(1);
    expect(history[0]).toMatchObject({
      pr_number: 356,
      title: 'Add ioredis client for session cache', // the `(#356)` marker is stripped
      author: 'marisa.koch',
      merged_at: '2026-02-02T10:00:00Z',
    });
  });

  it('folds one PR that touched several files into ONE entry with the overlap', () => {
    const { history } = buildPrHistory(
      [
        commit({ file: 'src/lib/redis.ts' }),
        commit({ file: 'src/middleware/ratelimit.ts' }),
      ],
      CHANGED,
    );
    expect(history).toHaveLength(1);
    expect(history[0]!.files_overlap).toEqual([
      'src/lib/redis.ts',
      'src/middleware/ratelimit.ts',
    ]);
  });

  it('derives notes from the overlap — grounded, no model call', () => {
    const { history } = buildPrHistory(
      [commit({ file: 'src/lib/redis.ts' }), commit({ file: 'src/middleware/ratelimit.ts' })],
      CHANGED,
    );
    expect(history[0]!.notes).toBe(
      'Touched 2 of the 3 files this PR changes: src/lib/redis.ts, src/middleware/ratelimit.ts',
    );
  });

  // ---- MERGE COMMITS (GitHub's other merge strategy) -----------------------
  // REGRESSION: this shipped squash-only, so a repo that uses merge commits — like
  // DevDigest's own — got an empty PR history on EVERY pull request, and it looked like
  // "no prior PR touched these files" rather than like a bug.

  it('recovers a PR from a MERGE COMMIT, taking the title from the BODY', () => {
    const { history } = buildPrHistory(
      [
        commit({
          message: 'Merge pull request #5 from fanatishe/feat/new_agents',
          body: 'Add the new agents\n\nSome longer explanation.',
        }),
      ],
      CHANGED,
    );
    expect(history).toHaveLength(1);
    expect(history[0]).toMatchObject({
      pr_number: 5,
      // NOT "Merge pull request #5 from fanatishe/feat/new_agents", and NOT the branch.
      title: 'Add the new agents',
    });
  });

  it('falls back to the subject when a merge commit has no body AND no imported title', () => {
    const { history } = buildPrHistory(
      [commit({ message: 'Merge pull request #5 from fanatishe/feat/x', body: '' })],
      CHANGED,
    );
    // A branch-name-ish title is poor, but dropping a real PR would be worse.
    expect(history[0]).toMatchObject({ pr_number: 5 });
    expect(history[0]!.title).toContain('#5');
  });

  // ---- title enrichment from the imported-PR table -------------------------

  it('uses the imported GitHub title when a merge commit has an empty body', () => {
    const { history } = buildPrHistory(
      [commit({ message: 'Merge pull request #5 from fanatishe/feat/x', body: '' })],
      CHANGED,
      undefined,
      new Map([[5, 'Add findings severity filter']]),
    );
    // Not the branch line — the real title from our own pull_requests row.
    expect(history[0]!.title).toBe('Add findings severity filter');
  });

  it('does NOT let the imported title override a title git already recorded', () => {
    // The merge BODY is the title as recorded at merge time; it wins over whatever the
    // PR is called now. Same for a squash subject.
    const merge = buildPrHistory(
      [commit({ message: 'Merge pull request #5 from o/b', body: 'Original merge title' })],
      CHANGED,
      undefined,
      new Map([[5, 'Renamed later on GitHub']]),
    );
    expect(merge.history[0]!.title).toBe('Original merge title');

    const squash = buildPrHistory(
      [commit({ message: 'Squashed work (#7)' })],
      CHANGED,
      undefined,
      new Map([[7, 'Renamed later on GitHub']]),
    );
    expect(squash.history[0]!.title).toBe('Squashed work');
  });

  it('falls back to the subject when the number is not in the imported map', () => {
    const { history } = buildPrHistory(
      [commit({ message: 'Merge pull request #9 from o/b', body: '' })],
      CHANGED,
      undefined,
      new Map([[5, 'Some other PR']]), // #9 absent
    );
    expect(history[0]!.title).toContain('#9');
  });

  it('handles a repo that mixes both merge strategies', () => {
    const { history } = buildPrHistory(
      [
        commit({ message: 'Squashed thing (#356)', date: '2026-02-02T00:00:00Z' }),
        commit({
          message: 'Merge pull request #5 from o/b',
          body: 'Merged thing',
          date: '2026-03-01T00:00:00Z',
        }),
      ],
      CHANGED,
    );
    expect(history.map((h) => h.pr_number)).toEqual([5, 356]);
  });

  it('SKIPS a commit no PR produced, rather than guessing a number', () => {
    const { history } = buildPrHistory(
      [
        commit({ message: 'hotfix: bump timeout' }), // direct push
        commit({ message: "Merge branch 'main' into feat/x" }), // a plain branch merge
      ],
      CHANGED,
    );
    expect(history).toEqual([]);
  });

  it('does not mistake a mid-subject issue reference for the merge marker', () => {
    // `(#123)` here is a reference, not the trailing squash marker.
    const { history } = buildPrHistory(
      [commit({ message: 'Fix the (#123) regression in redis pooling' })],
      CHANGED,
    );
    expect(history).toEqual([]);
  });

  it('ignores commits touching a file this PR does not change', () => {
    const { history } = buildPrHistory([commit({ file: 'docs/unrelated.md' })], CHANGED);
    expect(history).toEqual([]);
  });

  it('excludes the PR being viewed from its own history', () => {
    const { history } = buildPrHistory([commit({})], CHANGED, 356);
    expect(history).toEqual([]);
  });

  it('sorts most recently merged first', () => {
    const { history } = buildPrHistory(
      [
        commit({ message: 'Old one (#288)', date: '2025-12-11T00:00:00Z' }),
        commit({ message: 'New one (#401)', date: '2026-03-18T00:00:00Z' }),
        commit({ message: 'Middle one (#356)', date: '2026-02-02T00:00:00Z' }),
      ],
      CHANGED,
    );
    expect(history.map((h) => h.pr_number)).toEqual([401, 356, 288]);
  });

  it('caps the list at HISTORY_MAX_ITEMS', () => {
    const commits = Array.from({ length: 12 }, (_, i) =>
      commit({ message: `PR ${i} (#${100 + i})`, date: `2026-01-${String(i + 1).padStart(2, '0')}T00:00:00Z` }),
    );
    expect(buildPrHistory(commits, CHANGED).history).toHaveLength(5);
  });

  it('elides a long overlap list in the notes', () => {
    const many = ['a.ts', 'b.ts', 'c.ts', 'd.ts', 'e.ts'];
    const { history } = buildPrHistory(
      many.map((f) => commit({ file: f })),
      many,
    );
    expect(history[0]!.notes).toBe(
      'Touched 5 of the 5 files this PR changes: a.ts, b.ts, c.ts, +2 more',
    );
  });

  it('returns an empty history for no commits — never throws', () => {
    expect(buildPrHistory([], CHANGED)).toEqual({ history: [] });
  });
});
