/* hooks/conventions.ts — React Query hooks for the Conventions tab (Skills Lab).
   Extraction scans the repo clone for house-rules; accepted candidates are merged
   (server-side draft) into a single skill created via the existing /skills route. */
"use client";

import React from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, API_BASE } from "../api";
import type {
  ConventionCandidate,
  ConventionScanProgress,
  ConventionScanStage,
  ConventionSkillDraft,
  RunEvent,
} from "@devdigest/shared";

const key = (repoId: string | null | undefined) => ["conventions", repoId];

/** The pipeline's stages, in the order the server runs them. */
export const SCAN_STAGES: ConventionScanStage[] = ["sample", "analyze", "verify", "persist"];

export type ScanStageStatus = "pending" | "active" | "done";

export interface ScanState {
  /** Per-stage status, derived from the streamed events — never from a timer. */
  stages: Record<ConventionScanStage, ScanStageStatus>;
  /** Human-readable lines, newest last — the same text the server logged. */
  lines: { t: string; msg: string; kind: RunEvent["kind"] }[];
  error: string | null;
}

const IDLE: ScanState = {
  stages: { sample: "pending", analyze: "pending", verify: "pending", persist: "pending" },
  lines: [],
  error: null,
};

/**
 * Live progress for one extract run. The client mints the `scanId`, hands it to the
 * extract POST, and subscribes here to the EXISTING `/runs/:id/events` SSE endpoint —
 * the bus is keyed by an arbitrary id and buffers + replays, so subscribing a tick after
 * the POST starts still yields every stage.
 *
 * Stage status comes only from real `start`/`done` events. We deliberately do NOT advance
 * stages on a timer: a fake progress bar that finishes before the work does is worse than
 * none. Pass `null` to tear the stream down.
 */
export function useScanProgress(scanId: string | null): ScanState {
  const [state, setState] = React.useState<ScanState>(IDLE);

  React.useEffect(() => {
    if (!scanId) {
      setState(IDLE);
      return;
    }
    setState(IDLE);

    const es = new EventSource(`${API_BASE}/runs/${scanId}/events`);

    const onMsg = (ev: MessageEvent) => {
      let e: RunEvent;
      try {
        e = JSON.parse(ev.data) as RunEvent;
      } catch {
        return; // keepalive / non-JSON frame
      }
      setState((prev) => {
        const next: ScanState = {
          stages: { ...prev.stages },
          lines: [...prev.lines, { t: e.t, msg: e.msg, kind: e.kind }],
          error: e.kind === "error" ? e.msg : prev.error,
        };
        const p = e.data as ConventionScanProgress | undefined;
        if (p?.stage) {
          next.stages[p.stage] = p.status === "done" ? "done" : "active";
          // A stage starting implies every earlier one finished — covers the (rare) case
          // of a dropped `done` frame leaving a stage stuck spinning behind the current one.
          if (p.status === "start") {
            for (const s of SCAN_STAGES) {
              if (s === p.stage) break;
              if (next.stages[s] !== "done") next.stages[s] = "done";
            }
          }
        }
        return next;
      });
    };

    es.onmessage = onMsg;
    for (const kind of ["info", "tool", "result", "error"]) {
      es.addEventListener(kind, onMsg as EventListener);
    }

    return () => es.close();
  }, [scanId]);

  return state;
}

/** Persisted candidates for a repo. */
export function useConventions(repoId: string | null | undefined) {
  return useQuery({
    queryKey: key(repoId),
    queryFn: () => api.get<ConventionCandidate[]>(`/repos/${repoId}/conventions`),
    enabled: !!repoId,
  });
}

/**
 * Run (or re-run) the extraction pipeline; result replaces the cached list.
 * `scanId` keys the live progress stream — see `useScanProgress`.
 */
export function useExtractConventions(repoId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (scanId: string) =>
      api.post<ConventionCandidate[]>(`/repos/${repoId}/conventions/extract`, {
        scan_id: scanId,
      }),
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
