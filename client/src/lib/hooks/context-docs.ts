/* hooks/context-docs.ts — React Query hooks for Project Context (SPEC-01).
   Discovery of a repo's `.md` under the configured roots, plus the attach/detach/
   reorder mutations for agents and skills. Contracts come from @devdigest/shared;
   this module never redefines them. */
"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../api";
import type { Agent, ContextDocContent, ContextDocList, Skill } from "@devdigest/shared";

/** List every discovered project-context document for a repo (path-only + token
    counts + live used-by tallies). Disabled until a repo is selected; an uncloned
    repo returns `{ docs: [], token_budget }` with 200 (AC-2). */
export function useContextDocs(repoId: string | null | undefined) {
  return useQuery({
    queryKey: ["context-docs", repoId],
    queryFn: () => api.get<ContextDocList>(`/repos/${repoId}/context-docs`),
    enabled: !!repoId,
  });
}

/** Fetch ONE document's full markdown body on demand for the preview pane (AC-6),
    from the lazy content endpoint. Separate from `useContextDocs` on purpose: the
    discovery listing is paths-only and never carries bodies. `path` is the
    repo-relative path from a list row; it is URL-encoded here. The server gates the
    read behind `isSafeRepoPath` and 404s unsafe/absent/non-`.md` paths. `body` is
    UNTRUSTED author markdown — the caller renders it via the safe `Markdown`
    primitive (Preview) or read-only raw source (Edit), never as HTML. */
export function useContextDocContent(repoId: string | null | undefined, path: string | null | undefined) {
  return useQuery({
    queryKey: ["context-doc-content", repoId, path],
    queryFn: () =>
      api.get<ContextDocContent>(
        `/repos/${repoId}/context-docs/content?path=${encodeURIComponent(path as string)}`,
      ),
    enabled: !!repoId && !!path,
  });
}

/** Replace an agent's ordered attached-document path list (attach/detach/reorder).
    Persists PATHS only — never document bodies (AC-7). */
export function useSetAgentContextDocs(agentId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (contextDocs: string[]) =>
      api.put<Agent>(`/agents/${agentId}/context-docs`, { context_docs: contextDocs }),
    onSuccess: (data) => {
      qc.setQueryData(["agent", data.id], data);
      qc.invalidateQueries({ queryKey: ["agents"] });
      // used_by_agents tallies in the discovery list change on every attach/detach.
      qc.invalidateQueries({ queryKey: ["context-docs"] });
    },
  });
}

/** Replace a skill's ordered attached-document path list — same contract as the
    agent mutation (AC-9). */
export function useSetSkillContextDocs(skillId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (contextDocs: string[]) =>
      api.put<Skill>(`/skills/${skillId}/context-docs`, { context_docs: contextDocs }),
    onSuccess: (data) => {
      qc.setQueryData(["skill", data.id], data);
      qc.invalidateQueries({ queryKey: ["skills"] });
      qc.invalidateQueries({ queryKey: ["context-docs"] });
    },
  });
}
