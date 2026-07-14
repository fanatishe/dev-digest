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
  });
}

/** Prior merged PRs that touched the files this PR changes. */
export function usePrHistory(prId: string | null | undefined) {
  return useQuery({
    queryKey: ["pr-history", prId],
    queryFn: () => api.get<PrHistory>(`/pulls/${prId}/history`),
    enabled: !!prId,
  });
}
