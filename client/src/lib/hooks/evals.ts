/* hooks/evals.ts — React Query hooks for the L06 Eval Pipeline (WP-D).

   Every eval fetch/mutation lives here; components (WP-E/F/G) call these hooks and
   never touch `api`/`fetch` directly. Response types come from `@devdigest/shared`
   and are never redefined locally. `api.*` takes no AbortSignal (client INSIGHTS
   2026-07-12). A live/in-flight run self-terminates its poll off the response
   payload, not a caller flag (client INSIGHTS 2026-07-15). */
"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../api";
import type {
  Agent,
  EvalAgentDashboard,
  EvalBatch,
  EvalCase,
  EvalCaseInput,
  EvalCaseWithRuns,
  EvalCompare,
  EvalDashboard,
  EvalDashboardRunAllResult,
  EvalOwnerKind,
  EvalRunAllResult,
  EvalRunRecord,
  EvalRunResult,
} from "@devdigest/shared";

/** Owner selector for the owner-scoped list endpoint (`agent` or `skill`). */
export interface EvalOwner {
  kind: EvalOwnerKind;
  id: string;
}

/** Optional ISO date-range filter (default last 30 days, applied server-side). */
export interface DateRange {
  from?: string;
  to?: string;
}

/** Serialize an optional `{from,to}` range to a query string ("" when both absent). */
function rangeQuery(range?: DateRange): string {
  const params = new URLSearchParams();
  if (range?.from) params.set("from", range.from);
  if (range?.to) params.set("to", range.to);
  const qs = params.toString();
  return qs ? `?${qs}` : "";
}

// ---- Cases (list + single) ------------------------------------------------

/** Case-list rows for one owner — each carries its last run + repro summary. */
export function useEvalCases(owner: EvalOwner | null | undefined) {
  return useQuery({
    queryKey: ["eval-cases", owner?.kind, owner?.id],
    queryFn: () =>
      api.get<EvalCaseWithRuns[]>(
        `/eval/cases?owner_kind=${owner!.kind}&owner_id=${owner!.id}`,
      ),
    enabled: !!owner?.id,
  });
}

export function useEvalCase(id: string | null | undefined) {
  return useQuery({
    queryKey: ["eval-case", id],
    queryFn: () => api.get<EvalCase>(`/eval/cases/${id}`),
    enabled: !!id,
  });
}

// ---- Case mutations -------------------------------------------------------

/** Invalidate an owner's case list after a write (kind/id come off the case). */
function invalidateOwnerCases(
  qc: ReturnType<typeof useQueryClient>,
  owner: { owner_kind: EvalOwnerKind; owner_id: string },
) {
  qc.invalidateQueries({ queryKey: ["eval-cases", owner.owner_kind, owner.owner_id] });
}

export function useCreateEvalCase() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: EvalCaseInput) => api.post<EvalCase>("/eval/cases", input),
    onSuccess: (created) => {
      invalidateOwnerCases(qc, created);
      qc.setQueryData(["eval-case", created.id], created);
    },
  });
}

export interface UpdateEvalCaseInput {
  id: string;
  patch: Partial<EvalCaseInput>;
}

export function useUpdateEvalCase() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, patch }: UpdateEvalCaseInput) =>
      api.put<EvalCase>(`/eval/cases/${id}`, patch),
    onSuccess: (updated) => {
      invalidateOwnerCases(qc, updated);
      qc.setQueryData(["eval-case", updated.id], updated);
    },
  });
}

export function useDeleteEvalCase() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.del<{ ok: boolean }>(`/eval/cases/${id}`),
    onSuccess: (_d, id) => {
      qc.invalidateQueries({ queryKey: ["eval-cases"] });
      qc.removeQueries({ queryKey: ["eval-case", id] });
      qc.removeQueries({ queryKey: ["eval-case-runs", id] });
    },
  });
}

// ---- Runs -----------------------------------------------------------------

export interface RunCaseInput {
  caseId: string;
  /** Number of executions; server default is 1 (AC-13 uses 5). */
  times?: number;
}

/** Ad-hoc "Run N×" on a case → N eval_runs on the pinned version (AC-13). */
export function useRunCase() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ caseId, times }: RunCaseInput) =>
      api.post<EvalRunResult[]>(
        `/eval/cases/${caseId}/run`,
        times != null ? { times } : undefined,
      ),
    onSuccess: (_d, { caseId }) => {
      qc.invalidateQueries({ queryKey: ["eval-case-runs", caseId] });
      qc.invalidateQueries({ queryKey: ["eval-cases"] });
    },
  });
}

/** Newest-first recent runs of a case — drives the ReproRateBadge (AC-14). While
   any run is still unscored (`pass === null`) the query self-polls off its own
   payload and stops the instant every run has a verdict (client INSIGHTS 2026-07-15). */
export function useCaseRuns(id: string | null | undefined, limit = 5) {
  return useQuery({
    queryKey: ["eval-case-runs", id, limit],
    queryFn: () => api.get<EvalRunRecord[]>(`/eval/cases/${id}/runs?limit=${limit}`),
    enabled: !!id,
    refetchInterval: (query) =>
      (query.state.data ?? []).some((run) => run.pass === null) ? 2000 : false,
  });
}

// ---- Run-all (one batch = one trend point) --------------------------------

/** Per-agent run-all → one eval_batches row + one eval_run per case (AC-22). */
export function useRunAll(agentId: string | null | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (vars?: { version?: number }) =>
      api.post<EvalRunAllResult>(
        `/agents/${agentId}/eval/run-all`,
        vars?.version != null ? { version: vars.version } : undefined,
      ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["eval-dashboard"] });
      qc.invalidateQueries({ queryKey: ["agent-eval-dashboard", agentId] });
      qc.invalidateQueries({ queryKey: ["agent-eval-batches", agentId] });
      qc.invalidateQueries({ queryKey: ["eval-cases", "agent", agentId] });
    },
  });
}

/**
 * Roll the just-run cases into ONE dashboard batch (a trend point) without re-running the
 * model. The per-row Run posts [caseId] (→ a 1-case batch labelled by the case); "Run all
 * evals" posts every id (→ an "All (N)" batch). Invalidates every dashboard surface so the
 * new point shows immediately. Owner-agnostic (agents + skills), keyed off the owner.
 */
export function useBatchFromLatest(owner: { kind: "agent" | "skill"; id: string } | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (caseIds: string[]) =>
      api.post<EvalBatch>(`/${owner?.kind}s/${owner?.id}/eval/batch-from-latest`, {
        case_ids: caseIds,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["eval-dashboard"] });
      qc.invalidateQueries({ queryKey: ["agent-eval-dashboard", owner?.id] });
      qc.invalidateQueries({ queryKey: ["agent-eval-batches", owner?.id] });
      qc.invalidateQueries({ queryKey: ["eval-cases", owner?.kind, owner?.id] });
    },
  });
}

/** Whole-dashboard run-all → one batch per agent that has cases (AC-22). Needs a
   provider key; callers gate the affordance on `useSecretsStatus` and surface the
   error non-throwingly when a live run fails (AC-27). */
export function useDashboardRunAll() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () =>
      api.post<EvalDashboardRunAllResult>("/eval/dashboard/run-all", undefined),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["eval-dashboard"] });
      qc.invalidateQueries({ queryKey: ["agent-eval-dashboard"] });
      qc.invalidateQueries({ queryKey: ["agent-eval-batches"] });
      qc.invalidateQueries({ queryKey: ["eval-cases"] });
    },
  });
}

// ---- Dashboards -----------------------------------------------------------

/** All-agents dashboard (agents only — never a skill owner; AC-20). */
export function useEvalDashboard() {
  return useQuery({
    queryKey: ["eval-dashboard"],
    queryFn: () => api.get<EvalAgentDashboard>("/eval/dashboard"),
  });
}

/** Per-agent detail dashboard (trend + recent batches), date-range filtered (AC-29). */
export function useAgentEvalDashboard(id: string | null | undefined, range?: DateRange) {
  return useQuery({
    queryKey: ["agent-eval-dashboard", id, range?.from, range?.to],
    queryFn: () =>
      api.get<EvalDashboard>(`/agents/${id}/eval/dashboard${rangeQuery(range)}`),
    enabled: !!id,
  });
}

/** Per-agent batches for the detail trend/table, date-range filtered (AC-29). */
export function useAgentEvalBatches(id: string | null | undefined, range?: DateRange) {
  return useQuery({
    queryKey: ["agent-eval-batches", id, range?.from, range?.to],
    queryFn: () =>
      api.get<EvalBatch[]>(`/agents/${id}/eval/batches${rangeQuery(range)}`),
    enabled: !!id,
  });
}

// ---- Compare + Promote ----------------------------------------------------

/** Run-vs-run compare of two batches — deltas + both resolved prompts (AC-23). */
export function useEvalCompare(
  base: string | null | undefined,
  head: string | null | undefined,
) {
  return useQuery({
    queryKey: ["eval-compare", base, head],
    queryFn: () => api.get<EvalCompare>(`/eval/compare?base=${base}&head=${head}`),
    enabled: !!base && !!head,
  });
}

export interface PromoteVersionInput {
  agentId: string;
  version: number;
}

/** Promote a version's config to the agent via the agents repo (AC-24). */
export function usePromoteVersion() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ agentId, version }: PromoteVersionInput) =>
      api.post<Agent>(`/agents/${agentId}/eval/promote`, { version }),
    onSuccess: (agent) => {
      qc.invalidateQueries({ queryKey: ["agents"] });
      qc.setQueryData(["agent", agent.id], agent);
      qc.invalidateQueries({ queryKey: ["eval-dashboard"] });
      qc.invalidateQueries({ queryKey: ["agent-eval-dashboard", agent.id] });
    },
  });
}
