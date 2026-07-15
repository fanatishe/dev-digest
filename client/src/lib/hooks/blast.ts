/* hooks/blast.ts — React Query hooks for the Blast Radius card.

   `GET /pulls/:id/blast-radius` answers the reviewer's first question — "what could
   this change break?" — which the diff itself cannot, because the answer lives in the
   code the diff does NOT show.

   It is FREE and it is fast: the server reads a pre-built index (symbols, resolved
   references, the import graph, per-file endpoint/cron facts) that was computed once,
   when the repo was cloned. No LLM call, nothing persisted per request. So it is safe
   to fetch on every visit to the Overview tab and cheap to refetch — exactly like
   `useSmartDiff`, and unlike `useComputeIntent` (which is a paid model call).

   `GET /pulls/:id/history` is the same deal: prior merged PRs touching these files,
   recovered from the clone's git log, with no model call and no GitHub API round-trip. */
"use client";

import { useQuery } from "@tanstack/react-query";
import { api } from "../api";
import type { BlastRadius, PrHistory } from "@devdigest/shared";

/**
 * While the server reports `refreshing: true`, a background clone/index resync is in
 * flight — the data shown is valid but a fresher version is landing shortly. Poll on this
 * interval until the response comes back `refreshing: false`, then stop. This is SELF-
 * TERMINATING: the server's staleness signal (`max(pr.updated_at) > index.updatedAt`)
 * stops firing the moment the resync bumps the index past the PR activity, so exactly one
 * or two refetches follow completion. Mirrors `useRepoIntelStatus(poll)`, but the "keep
 * polling?" decision is DATA-DRIVEN off the response rather than a caller-owned flag.
 */
const REFRESHING_POLL_MS = 1500;

/**
 * Changed symbols → callers → endpoints/crons at risk.
 *
 * A `degraded: true` response is NOT an error and must not be thrown away: it is a
 * real, partial answer, and the card badges it. An empty blast radius from an
 * unindexed repo looks exactly like "nothing is affected" — the card's job is to make
 * sure nobody reads it that way.
 */
export function useBlastRadius(prId: string | null | undefined) {
  return useQuery({
    queryKey: ["blast", prId],
    // `api.get` takes NO AbortSignal (see client/INSIGHTS.md — the signal param was reverted).
    queryFn: () => api.get<BlastRadius>(`/pulls/${prId}/blast-radius`),
    enabled: !!prId,
    // Auto-refresh the card once the in-flight resync lands (see REFRESHING_POLL_MS).
    refetchInterval: (query) => (query.state.data?.refreshing ? REFRESHING_POLL_MS : false),
  });
}

/** Prior merged PRs that touched the files this PR changes. */
export function usePrHistory(prId: string | null | undefined) {
  return useQuery({
    queryKey: ["pr-history", prId],
    queryFn: () => api.get<PrHistory>(`/pulls/${prId}/history`),
    enabled: !!prId,
    // Same self-terminating poll as useBlastRadius: refetch until history is fresh.
    refetchInterval: (query) => (query.state.data?.refreshing ? REFRESHING_POLL_MS : false),
  });
}
