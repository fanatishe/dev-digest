/* hooks/intent.ts — React Query hooks for the PR Intent layer.
   `GET /pulls/:id/intent` returns the persisted intent (or null — a PR that has
   never had one computed is NOT an error), `POST /pulls/:id/intent` recomputes it
   from the PR's metadata only. The POST result replaces the cached record directly
   (cheaper than invalidate + refetch — same trick as `useExtractConventions`). */
"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../api";
import type { PrIntentRecord } from "@devdigest/shared";

const key = (prId: string | null | undefined) => ["pr-intent", prId];

/** The stored intent for a PR — `null` when none has been derived yet. */
export function useIntent(prId: string | null | undefined) {
  return useQuery({
    queryKey: key(prId),
    queryFn: () => api.get<PrIntentRecord | null>(`/pulls/${prId}/intent`),
    enabled: !!prId,
  });
}

/**
 * Derive (or re-derive) the intent. Never runs on its own — a review injects an
 * existing intent but never silently computes one, so this is only ever fired by
 * the card's recompute button. The multi-second model call is surfaced through the
 * mutation's `isPending` (the button's spinner); no `scan_id` is minted, so no SSE
 * stream is opened.
 */
export function useComputeIntent(prId: string | null | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.post<PrIntentRecord>(`/pulls/${prId}/intent`, {}),
    onSuccess: (data) => qc.setQueryData(key(prId), data),
  });
}
