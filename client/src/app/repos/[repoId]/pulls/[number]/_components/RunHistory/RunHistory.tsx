"use client";

import type { Severity } from "@devdigest/ui";
import type { RunSummary, PrCommit } from "@devdigest/shared";
import type { RunFindings } from "./helpers";
import { RunRow } from "./_components/RunRow";
import { CommitRow } from "./_components/CommitRow";

/**
 * PR timeline — every agent run interleaved with the PR's commits, newest-first
 * and DB-backed so it survives reload. Showing commits between runs makes it
 * clear which commit each review ran against. Each row is a `RunRow` or a
 * `CommitRow`; this component only interleaves and sorts them.
 */

type TimelineItem =
  | { kind: "run"; ts: number; run: RunSummary }
  | { kind: "commit"; ts: number; commit: PrCommit };

/** Epoch ms for sorting; unparseable / missing timestamps sort last. */
function tsOf(s: string | null | undefined): number {
  if (!s) return 0;
  const n = Date.parse(s);
  return Number.isNaN(n) ? 0 : n;
}

export function RunHistory({
  runs,
  commits = [],
  findingsByRun,
  onOpenTrace,
  onGoToReview,
  onSelectSeverity,
  onSelectFinding,
  onDelete,
}: {
  runs: RunSummary[];
  commits?: PrCommit[];
  /** Per-run severity breakdown + hover preview, keyed by run_id. */
  findingsByRun?: Map<string, RunFindings>;
  /** Open the trace + log drawer for a run (the logs icon). */
  onOpenTrace: (runId: string) => void;
  /** Jump to this run's inline review accordion below (clicking the agent name). */
  onGoToReview?: (runId: string) => void;
  /** Drill into a single severity of a run's findings (clicking a counter chip). */
  onSelectSeverity?: (runId: string, severity: Severity) => void;
  /** Open a specific finding from the run's hover popover. */
  onSelectFinding?: (id: string) => void;
  onDelete?: (runId: string) => void;
}) {
  if (runs.length === 0 && commits.length === 0) return null;

  const items: TimelineItem[] = [
    ...runs.map((run) => ({ kind: "run" as const, ts: tsOf(run.ran_at), run })),
    ...commits.map((commit) => ({
      kind: "commit" as const,
      ts: tsOf(commit.committed_at),
      commit,
    })),
  ].sort((a, b) => b.ts - a.ts);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {items.map((item) =>
        item.kind === "commit" ? (
          <CommitRow key={`commit:${item.commit.sha}`} commit={item.commit} />
        ) : (
          <RunRow
            key={`run:${item.run.run_id}`}
            run={item.run}
            findings={findingsByRun?.get(item.run.run_id)}
            onOpenTrace={onOpenTrace}
            onGoToReview={onGoToReview}
            onSelectSeverity={onSelectSeverity}
            onSelectFinding={onSelectFinding}
            onDelete={onDelete}
          />
        ),
      )}
    </div>
  );
}
