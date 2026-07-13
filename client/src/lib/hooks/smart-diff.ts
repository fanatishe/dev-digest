/* hooks/smart-diff.ts — React Query hook for the Smart Diff view.
   `GET /pulls/:id/smart-diff` regroups the PR's ALREADY-STORED files (pr_files) by
   role (core / wiring / boilerplate) and tags each file with the lines the latest
   review flagged. It is a pure server-side composition of data we already have —
   no LLM call, nothing persisted — so it is cheap to refetch and safe to call on
   every visit to the Files-changed tab. */
"use client";

import { useQuery } from "@tanstack/react-query";
import { api } from "../api";
import type { SmartDiff } from "@devdigest/shared";

/** The role-grouped view of a PR's diff — `enabled` only once the PR uuid resolves. */
export function useSmartDiff(prId: string | null | undefined) {
  return useQuery({
    queryKey: ["smart-diff", prId],
    // `api.get` takes NO AbortSignal (see client/INSIGHTS.md — the signal param was reverted).
    queryFn: () => api.get<SmartDiff>(`/pulls/${prId}/smart-diff`),
    enabled: !!prId,
  });
}
