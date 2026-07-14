#!/usr/bin/env bash
# Why is "Prior PRs touching these files" empty?
#
# There are only three possible answers, and they are indistinguishable from the UI —
# an empty list looks the same whichever it is. This script says which one you have.
#
#   1. The clone is still SHALLOW (--depth 1). `git log` can see no history at all, for
#      any file. This is the default state of every repo imported before the deepen fix,
#      and it is fixed by re-indexing (Re-analyze in the UI, or POST /repos/:id/resync).
#   2. The clone has history, but almost none of it is attributable to a PR — the repo
#      pushes straight to main instead of merging PRs. Then an empty list is CORRECT.
#   3. The clone has history AND PR-attributable commits → the feature should be working,
#      and anything still empty is a real bug worth reporting.
#
# Usage:  ./scripts/diagnose-history.sh [path-to-clone]
#         (defaults to scanning every clone under server/clones/)

set -uo pipefail
cd "$(dirname "$0")/.."

# The commit subjects a PR leaves behind: GitHub's squash marker `(#123)` anchored to the
# end of the subject, or a merge commit `Merge pull request #123 from …`.
PR_MARKER='\(#[0-9]+\)[[:space:]]*$|^Merge pull request #[0-9]+ from '

diagnose() {
  local repo="$1"
  echo "──────────────────────────────────────────────────────────────"
  echo "clone: $repo"

  if [ ! -d "$repo/.git" ]; then
    echo "  ✗ not a git repo — nothing to read."
    return
  fi

  local commits
  commits=$(git -C "$repo" rev-list --count HEAD 2>/dev/null || echo 0)

  if [ -f "$repo/.git/shallow" ]; then
    echo "  SHALLOW  ✗   commits in clone: $commits"
    echo ""
    echo "  → CAUSE 1. The import clones with --depth 1, so git log sees no history."
    echo "    PR history WILL be empty for every PR, and so will file_rank.hotness."
    echo "    FIX: re-index this repo so the index job runs 'git fetch --deepen':"
    echo "         click Re-analyze in the UI, or  POST /repos/:id/resync"
    return
  fi

  echo "  deep     ✓   commits in clone: $commits"

  # `--full-history` is NOT needed here (we are not filtering by path), but the marker
  # regex must match what pulls/blast.constants.ts actually parses.
  local prCommits
  prCommits=$(git -C "$repo" log --format='%s' | grep -cE "$PR_MARKER" || true)
  echo "  commits attributable to a PR: $prCommits / $commits"

  if [ "$prCommits" -eq 0 ]; then
    echo ""
    echo "  → CAUSE 2. This repo has history, but none of it came from a merged PR"
    echo "    (everything was pushed straight to the default branch). An empty"
    echo "    'Prior PRs' list is CORRECT here — there are no prior PRs to show."
    return
  fi

  echo ""
  echo "  most recent PR-attributable commits:"
  # SUBJECTS ONLY (`%s`, nothing prepended). Both halves of PR_MARKER are anchored —
  # `^Merge pull request` to the start, `(#N)` to the end — so prefixing the line with a
  # short hash silently breaks BOTH and this prints a fraction of the real matches.
  git -C "$repo" log --format='%s' | grep -E "$PR_MARKER" | head -5 | sed 's/^/    /'
  echo ""
  echo "  → CAUSE 3. History is present and PRs are attributable. The card SHOULD show"
  echo "    prior PRs for any PR whose changed files overlap the files those PRs touched."
  echo "    Still empty? That is a real bug — capture the PR number and report it."
}

if [ $# -ge 1 ]; then
  diagnose "$1"
else
  shopt -s nullglob
  found=0
  for repo in server/clones/*/*/; do
    diagnose "${repo%/}"
    found=1
  done
  if [ "$found" -eq 0 ]; then
    echo "No clones found under server/clones/ — import a repo first."
  fi
fi
echo "──────────────────────────────────────────────────────────────"
