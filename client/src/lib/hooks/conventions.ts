/* hooks/conventions.ts — React Query hooks for the Conventions tab (Skills Lab).
   Extraction scans the repo clone for house-rules; accepted candidates are merged
   (server-side draft) into a single skill created via the existing /skills route. */
"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../api";
import type { ConventionCandidate, ConventionSkillDraft } from "@devdigest/shared";

const key = (repoId: string | null | undefined) => ["conventions", repoId];

/** Persisted candidates for a repo. */
export function useConventions(repoId: string | null | undefined) {
  return useQuery({
    queryKey: key(repoId),
    queryFn: () => api.get<ConventionCandidate[]>(`/repos/${repoId}/conventions`),
    enabled: !!repoId,
  });
}

/** Run (or re-run) the extraction pipeline; result replaces the cached list. */
export function useExtractConventions(repoId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.post<ConventionCandidate[]>(`/repos/${repoId}/conventions/extract`),
    onSuccess: (data) => qc.setQueryData(key(repoId), data),
  });
}

/** Accept a candidate (or edit its rule). Updates the cached list in place. */
export function useAcceptConvention(repoId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { id: string; accepted?: boolean; rule?: string }) =>
      api.patch<ConventionCandidate>(`/conventions/${input.id}`, {
        ...(input.accepted !== undefined ? { accepted: input.accepted } : {}),
        ...(input.rule !== undefined ? { rule: input.rule } : {}),
      }),
    onSuccess: (updated) => {
      qc.setQueryData<ConventionCandidate[]>(key(repoId), (prev) =>
        (prev ?? []).map((c) => (c.id === updated.id ? updated : c)),
      );
    },
  });
}

/** Reject a candidate — it's removed server-side and drops out of the list. */
export function useRejectConvention(repoId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.del<{ deleted: string }>(`/conventions/${id}`),
    onSuccess: (_d, id) => {
      qc.setQueryData<ConventionCandidate[]>(key(repoId), (prev) =>
        (prev ?? []).filter((c) => c.id !== id),
      );
    },
  });
}

/** Merged, UNSAVED skill draft from the repo's accepted conventions. */
export function useConventionSkillDraft(repoId: string | null | undefined, enabled: boolean) {
  return useQuery({
    queryKey: ["conventions-skill-draft", repoId],
    queryFn: () => api.get<ConventionSkillDraft>(`/repos/${repoId}/conventions/skill-draft`),
    enabled: !!repoId && enabled,
  });
}
