/* hooks/skills.ts — React Query hooks for the Skills page + the Agent editor's
   Skills tab. Skills are reusable prompt blocks; the agent side (link/reorder)
   goes through the existing /agents/:id/skills endpoints. */
"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../api";
import type { AgentSkillLink, Skill, SkillSource, SkillType } from "@devdigest/shared";

export function useSkills() {
  return useQuery({
    queryKey: ["skills"],
    queryFn: () => api.get<Skill[]>("/skills"),
  });
}

export function useSkill(id: string | null | undefined) {
  return useQuery({
    queryKey: ["skill", id],
    queryFn: () => api.get<Skill>(`/skills/${id}`),
    enabled: !!id,
  });
}

export interface CreateSkillInput {
  name: string;
  description: string;
  type: SkillType;
  source?: SkillSource;
  body: string;
  enabled?: boolean;
  evidence_files?: string[] | null;
  message?: string;
}

/** A body snapshot in the Versions tab. */
export interface SkillVersion {
  skill_id: string;
  version: number;
  body: string;
  message: string | null;
  created_at: string;
}

/** Usage stats for the Stats tab. */
export interface SkillStats {
  used_by: number;
  agents: { id: string; name: string }[];
}

export function useCreateSkill() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateSkillInput) => api.post<Skill>("/skills", input),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["skills"] }),
  });
}

export interface UpdateSkillInput {
  id: string;
  patch: Partial<Pick<Skill, "name" | "description" | "type" | "body" | "enabled">> & {
    /** Optional "what changed" note recorded when the body changes. */
    message?: string;
  };
}

export function useUpdateSkill() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, patch }: UpdateSkillInput) => api.put<Skill>(`/skills/${id}`, patch),
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ["skills"] });
      qc.setQueryData(["skill", data.id], data);
      qc.invalidateQueries({ queryKey: ["skill-versions", data.id] });
    },
  });
}

export function useSkillVersions(id: string | null | undefined) {
  return useQuery({
    queryKey: ["skill-versions", id],
    queryFn: () => api.get<SkillVersion[]>(`/skills/${id}/versions`),
    enabled: !!id,
  });
}

export function useRestoreSkillVersion(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { version: number; message?: string }) =>
      api.post<Skill>(`/skills/${id}/restore`, input),
    onSuccess: (data) => {
      qc.setQueryData(["skill", id], data);
      qc.invalidateQueries({ queryKey: ["skills"] });
      qc.invalidateQueries({ queryKey: ["skill-versions", id] });
    },
  });
}

export function useSkillStats(id: string | null | undefined) {
  return useQuery({
    queryKey: ["skill-stats", id],
    queryFn: () => api.get<SkillStats>(`/skills/${id}/stats`),
    enabled: !!id,
  });
}

export function useDeleteSkill() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.del<{ ok: boolean }>(`/skills/${id}`),
    onSuccess: (_d, id) => {
      qc.invalidateQueries({ queryKey: ["skills"] });
      qc.removeQueries({ queryKey: ["skill", id] });
    },
  });
}

/** An extract-only import preview returned by POST /skills/import (nothing saved). */
export interface SkillPreview {
  name: string;
  body: string;
  type: SkillType;
  source: SkillSource;
  evidence_files: string[] | null;
}

export type ImportInput =
  | { kind: "markdown"; content: string; filename?: string; name?: string }
  | { kind: "archive"; content_base64: string; name?: string }
  | { kind: "url"; url: string; name?: string };

/** Build a preview from a file/URL. Persist happens later via useCreateSkill. */
export function useImportSkillPreview() {
  return useMutation({
    mutationFn: (input: ImportInput) => api.post<SkillPreview>("/skills/import", input),
  });
}

// ---- Agent side: link / reorder (existing /agents/:id/skills endpoints) -----

export function useAgentSkills(agentId: string | null | undefined) {
  return useQuery({
    queryKey: ["agent-skills", agentId],
    queryFn: () => api.get<AgentSkillLink[]>(`/agents/${agentId}/skills`),
    enabled: !!agentId,
  });
}

/** Replace the full ordered set of a skill's links for an agent (checkbox + drag). */
export function useSetAgentSkills(agentId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (skillIds: string[]) =>
      api.post<AgentSkillLink[]>(`/agents/${agentId}/skills`, { skill_ids: skillIds }),
    onSuccess: (data) => {
      qc.setQueryData(["agent-skills", agentId], data);
      qc.invalidateQueries({ queryKey: ["agents"] });
    },
  });
}
