/* PrDetailView — the /repos/:repoId/pulls/:number screen body: header + tabs
   (Overview / Findings / Diff) + the run-trace drawer. Extracted from the route
   so `page.tsx` can be a thin Server Component that owns metadata; this view
   stays a Client Component (data hooks, router, search params). Tab/trace/
   severity/finding state all live in the URL query. */
"use client";

import React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ErrorState, type Severity } from "@devdigest/ui";
import { AppShell } from "@/components/app-shell";
import { RepoNotFound } from "@/components/repo-not-found";
import { PrDetailSkeleton } from "./_components/PrDetailSkeleton";
import { mergeParams, parseSeverity } from "./helpers";
import { PrDetailHeader } from "../PrDetailHeader";
import { OverviewTab } from "../OverviewTab";
import { FindingsTab } from "../FindingsTab";
import { DiffTab } from "../DiffTab";
import RunTraceDrawer from "../RunTraceDrawer";
import { usePullDetail, usePulls } from "@/lib/hooks";
import { useQueryClient } from "@tanstack/react-query";
import { usePrReviews, useCancelRun, usePrActiveRuns, usePrRuns, useDeleteRun } from "@/lib/hooks/reviews";
import { useActiveRepo, useRepoNotFound } from "@/lib/repo-context";
import { useConfirm } from "@/lib/confirm";
import { ApiError } from "@/lib/api";
import { githubPrUrl } from "@/lib/github-urls";
import type { FindingRecord } from "@devdigest/shared";

export function PrDetailView({ repoId, number }: { repoId: string; number: string }) {
  const search = useSearchParams();
  const router = useRouter();
  const { activeRepo } = useActiveRepo();
  const confirm = useConfirm();
  const repoNotFound = useRepoNotFound(repoId);
  // The route is keyed by PR number, but every PR API is keyed by the row's
  // uuid — resolve number → uuid via the (cached) pulls list before fetching.
  const { data: pulls, isLoading: pullsLoading } = usePulls(repoId);
  const prId = pulls?.find((p) => p.number === Number(number))?.id ?? null;
  const { data: pr, isLoading: detailLoading, isError, error, refetch } = usePullDetail(prId);

  const isLoading = pullsLoading || (prId != null && detailLoading);
  const { data: reviews, refetch: refetchReviews } = usePrReviews(prId);

  // Live run tracking is SERVER-SOURCED (agent_runs status='running'): survives
  // navigation AND reload, and self-clears via polling when runs finish.
  const qc = useQueryClient();
  const { data: activeRuns } = usePrActiveRuns(prId);
  const { data: prRuns } = usePrRuns(prId);
  const deleteRun = useDeleteRun(prId);
  const liveRunIds = (activeRuns ?? []).map((r) => r.run_id);
  const reviewRunning = liveRunIds.length > 0;
  const cancel = useCancelRun();
  const invalidateActiveRuns = () => {
    if (prId) qc.invalidateQueries({ queryKey: ["pr-active-runs", prId] });
  };
  // When a run settles (done OR failed) refresh the full run history too, so a
  // just-failed run shows up in "Run history" immediately — no page reload.
  const invalidateRunHistory = () => {
    if (prId) qc.invalidateQueries({ queryKey: ["pr-runs", prId] });
  };

  const tab = search.get("tab") ?? "overview";
  const traceRunId = search.get("trace");
  const severity: Severity | null = parseSeverity(search.get("severity"));
  // Deep-link to a specific finding (from the PR-list popover) → reveal it below.
  const finding = search.get("finding");
  /**
   * Write several query params in ONE navigation. Two sequential single-key
   * writes would both read the same (stale) `search` snapshot and the second
   * would clobber the first — which is exactly what the diff's finding badge
   * needs to avoid: it sets `tab=findings` AND `finding=<id>` together.
   * `router.replace` (not push) ⇒ no page reload; the existing FindingsTab
   * reveal chain picks `?finding=` up and expands/scrolls the card.
   */
  const setParams = (patch: Record<string, string | null>) => {
    router.replace(`/repos/${repoId}/pulls/${number}${mergeParams(search.toString(), patch)}`);
  };
  const setParam = (key: string, val: string | null) => setParams({ [key]: val });
  const setTab = (t: string) => setParam("tab", t);

  // Reviews come newest-first; each is its own run (grouped into accordions).
  const runs = reviews ?? [];
  const allFindings: FindingRecord[] = React.useMemo(
    () => runs.flatMap((r) => r.findings),
    [reviews],
  );
  const lethalTrifecta = allFindings.filter((f) => f.kind === "lethal_trifecta");
  const findingsCount = allFindings.length;
  // The "Agent runs" tab counts RUNS, not findings — and it counts them from
  // `prRuns` (every run, incl. running/failed) rather than `reviews` (only runs
  // that landed a review record), so starting a review ticks the tab at once.
  const runsCount = prRuns?.length ?? 0;
  // The diff badges anchor on the LATEST review's findings only (runs are
  // newest-first, and `kind: 'summary'` rows carry none) — stacking every past
  // run's findings onto the gutter would badge lines that a re-review cleared.
  // Dismissed ones are excluded (mirroring the server's `finding_lines`): the
  // Findings tab hides them, so a badge for one would reveal nothing.
  const latestFindings: FindingRecord[] = React.useMemo(
    () =>
      ((reviews ?? []).find((r) => r.kind === "review")?.findings ?? []).filter(
        (f) => f.dismissed_at == null,
      ),
    [reviews],
  );

  const repoName = activeRepo?.full_name ?? repoId;
  // The real "owner/repo" (null until the repo is loaded) — used to build
  // github.com deep-links for the header and finding file references.
  const repoFullName = activeRepo?.full_name ?? null;
  const crumb = [
    { label: repoName, mono: true, href: `/repos/${repoId}/pulls` },
    { label: "Pull Requests", href: `/repos/${repoId}/pulls` },
    { label: `#${number}`, mono: true },
  ];

  // Stale/unknown :repoId → friendly empty state instead of a 404 error.
  if (repoNotFound) {
    return (
      <AppShell crumb={crumb}>
        <RepoNotFound />
      </AppShell>
    );
  }

  if (isLoading) {
    return (
      <AppShell crumb={crumb}>
        <PrDetailSkeleton />
      </AppShell>
    );
  }

  if (isError || !pr) {
    return (
      <AppShell crumb={crumb}>
        <ErrorState
          fullScreen
          title="Couldn't load this pull request"
          body={error instanceof ApiError ? error.message : `PR #${number} could not be loaded.`}
          onRetry={() => refetch()}
        />
      </AppShell>
    );
  }

  return (
    <AppShell crumb={crumb}>
      <PrDetailHeader
        pr={pr}
        prId={prId}
        tab={tab}
        runsCount={runsCount}
        githubUrl={repoFullName ? githubPrUrl(repoFullName, pr.number) : null}
        onSetTab={setTab}
        onRunStart={() => setTab("findings")}
        onRunsStarted={() => invalidateActiveRuns()}
      />

      <div style={{ padding: "24px 32px 44px", display: "flex", flexDirection: "column", gap: 24, maxWidth: 1080, margin: "0 auto" }}>
        {tab === "overview" && <OverviewTab prId={prId} prBody={pr.body} />}

        {tab === "findings" && (
          <FindingsTab
            prId={prId}
            liveRunIds={liveRunIds}
            reviewRunning={reviewRunning}
            lethalTrifecta={lethalTrifecta}
            findingsCount={findingsCount}
            runs={runs}
            prRuns={prRuns}
            prCommits={pr.commits}
            repoFullName={repoFullName}
            headSha={pr.head_sha}
            severity={severity}
            targetFindingId={finding}
            onSelectSeverity={(sev) => setParam("severity", sev)}
            onClearSeverity={() => setParam("severity", null)}
            cancelMutation={cancel}
            onOpenTrace={(id) => setParam("trace", id)}
            onDelete={async (id) => {
              const ok = await confirm({
                title: "Delete run?",
                message: "Delete this run from history? (its logs are removed too)",
                confirmLabel: "Delete",
                danger: true,
              });
              if (ok) deleteRun.mutate(id);
            }}
            onRunDone={() => {
              invalidateActiveRuns();
              invalidateRunHistory();
              refetchReviews();
            }}
          />
        )}

        {tab === "diff" && (
          <DiffTab
            prId={prId}
            filesCount={pr.files_count}
            files={pr.files}
            findings={latestFindings}
            // ONE replace, BOTH keys — the existing FindingsTab reveal chain
            // (?finding= → nonce → accordion → FindingCard.expand+scroll) does
            // the rest. No reload, no new mechanism.
            onOpenFinding={(id) => setParams({ tab: "findings", finding: id })}
            canComment={pr.status === "open"}
          />
        )}
      </div>

      {prId && traceRunId && (
        <RunTraceDrawer
          runId={traceRunId}
          prNumber={pr.number}
          findings={runs.find((r) => r.run_id === traceRunId)?.findings ?? []}
          agentName={runs.find((r) => r.run_id === traceRunId)?.agent_name ?? null}
          onClose={() => setParam("trace", null)}
        />
      )}
    </AppShell>
  );
}
