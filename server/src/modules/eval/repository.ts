import { and, asc, desc, eq, gte, inArray, lte, sql } from 'drizzle-orm';
import type { Db } from '../../db/client.js';
import * as t from '../../db/schema.js';
import type { EvalOwnerKind } from '@devdigest/shared';

/**
 * Eval data-access (infra ring) — the ONLY layer in this module that touches the
 * DB. Owns the NEW `eval_batches` table and the additive `eval_runs.batch_id` /
 * `eval_runs.agent_version` columns, plus reads over the pre-existing
 * `eval_cases`/`eval_runs`. Workspace-scoped throughout (cases + batches carry
 * `workspace_id`; runs are reached only via their case).
 *
 * It never reaches another module's tables: agent data comes through
 * `container.agentsRepo` in the service, never a join here.
 */

export type EvalCaseRow = typeof t.evalCases.$inferSelect;
export type EvalRunRow = typeof t.evalRuns.$inferSelect;
export type EvalBatchRow = typeof t.evalBatches.$inferSelect;

export interface InsertEvalCase {
  workspaceId: string;
  ownerKind: EvalOwnerKind;
  ownerId: string;
  name: string;
  inputDiff: string;
  inputFiles?: unknown;
  inputMeta?: unknown;
  expectedOutput: unknown;
  notes?: string | null;
}

export interface UpdateEvalCase {
  name?: string;
  inputDiff?: string;
  inputFiles?: unknown;
  inputMeta?: unknown;
  expectedOutput?: unknown;
  notes?: string | null;
}

export interface InsertEvalRun {
  caseId: string;
  actualOutput: unknown;
  pass: boolean;
  recall: number;
  precision: number;
  citationAccuracy: number;
  durationMs: number | null;
  costUsd: number | null;
  batchId: string | null;
  agentVersion: number | null;
}

export interface InsertEvalBatch {
  workspaceId: string;
  ownerKind: EvalOwnerKind;
  ownerId: string;
  agentVersion: number | null;
  recall: number;
  precision: number;
  citationAccuracy: number;
  passRate: number;
  tracesPassed: number;
  tracesTotal: number;
  casesTotal: number;
  costUsd: number | null;
  durationMs: number | null;
}

export class EvalRepository {
  constructor(private db: Db) {}

  // ---- eval_cases ---------------------------------------------------------

  listCases(workspaceId: string, ownerKind: EvalOwnerKind, ownerId: string): Promise<EvalCaseRow[]> {
    return this.db
      .select()
      .from(t.evalCases)
      .where(
        and(
          eq(t.evalCases.workspaceId, workspaceId),
          eq(t.evalCases.ownerKind, ownerKind),
          eq(t.evalCases.ownerId, ownerId),
        ),
      )
      .orderBy(asc(t.evalCases.name));
  }

  async getCase(workspaceId: string, id: string): Promise<EvalCaseRow | undefined> {
    const [row] = await this.db
      .select()
      .from(t.evalCases)
      .where(and(eq(t.evalCases.workspaceId, workspaceId), eq(t.evalCases.id, id)));
    return row;
  }

  async createCase(values: InsertEvalCase): Promise<EvalCaseRow> {
    const [row] = await this.db
      .insert(t.evalCases)
      .values({
        workspaceId: values.workspaceId,
        ownerKind: values.ownerKind,
        ownerId: values.ownerId,
        name: values.name,
        inputDiff: values.inputDiff,
        inputFiles: (values.inputFiles as object | undefined) ?? null,
        inputMeta: (values.inputMeta as object | undefined) ?? null,
        expectedOutput: (values.expectedOutput as object | undefined) ?? null,
        notes: values.notes ?? null,
      })
      .returning();
    return row!;
  }

  async updateCase(
    workspaceId: string,
    id: string,
    patch: UpdateEvalCase,
  ): Promise<EvalCaseRow | undefined> {
    const [row] = await this.db
      .update(t.evalCases)
      .set({
        ...(patch.name !== undefined ? { name: patch.name } : {}),
        ...(patch.inputDiff !== undefined ? { inputDiff: patch.inputDiff } : {}),
        ...(patch.inputFiles !== undefined ? { inputFiles: patch.inputFiles as object } : {}),
        ...(patch.inputMeta !== undefined ? { inputMeta: patch.inputMeta as object } : {}),
        ...(patch.expectedOutput !== undefined
          ? { expectedOutput: patch.expectedOutput as object }
          : {}),
        ...(patch.notes !== undefined ? { notes: patch.notes } : {}),
      })
      .where(and(eq(t.evalCases.workspaceId, workspaceId), eq(t.evalCases.id, id)))
      .returning();
    return row;
  }

  async deleteCase(workspaceId: string, id: string): Promise<boolean> {
    const rows = await this.db
      .delete(t.evalCases)
      .where(and(eq(t.evalCases.workspaceId, workspaceId), eq(t.evalCases.id, id)))
      .returning({ id: t.evalCases.id });
    return rows.length > 0;
  }

  /** Count cases per owner id for a kind (drives the dashboard `cases_total`). */
  async countCasesByOwner(
    workspaceId: string,
    ownerKind: EvalOwnerKind,
  ): Promise<Map<string, number>> {
    const rows = await this.db
      .select({ ownerId: t.evalCases.ownerId, count: sql<number>`count(*)::int` })
      .from(t.evalCases)
      .where(and(eq(t.evalCases.workspaceId, workspaceId), eq(t.evalCases.ownerKind, ownerKind)))
      .groupBy(t.evalCases.ownerId);
    return new Map(rows.map((r) => [r.ownerId, r.count]));
  }

  // ---- eval_runs ----------------------------------------------------------

  async insertRun(values: InsertEvalRun): Promise<EvalRunRow> {
    const [row] = await this.db
      .insert(t.evalRuns)
      .values({
        caseId: values.caseId,
        actualOutput: (values.actualOutput as object | undefined) ?? null,
        pass: values.pass,
        recall: values.recall,
        precision: values.precision,
        citationAccuracy: values.citationAccuracy,
        durationMs: values.durationMs,
        costUsd: values.costUsd,
        batchId: values.batchId,
        agentVersion: values.agentVersion,
      })
      .returning();
    return row!;
  }

  /**
   * Runs for a case, newest-first. When `agentVersion` is given the window is
   * restricted to that pinned version (AC-15) — using the composite index
   * `(case_id, agent_version, ran_at desc)`.
   */
  runsForCase(
    caseId: string,
    opts: { agentVersion?: number | null; limit?: number } = {},
  ): Promise<EvalRunRow[]> {
    const where =
      opts.agentVersion == null
        ? eq(t.evalRuns.caseId, caseId)
        : and(eq(t.evalRuns.caseId, caseId), eq(t.evalRuns.agentVersion, opts.agentVersion));
    let q = this.db
      .select()
      .from(t.evalRuns)
      .where(where)
      .orderBy(desc(t.evalRuns.ranAt))
      .$dynamic();
    if (opts.limit != null) q = q.limit(opts.limit);
    return q;
  }

  /**
   * Most-recent runs across an owner's cases (dashboard `recent_runs`), joined
   * `eval_runs → eval_cases` on `case_id` and scoped by the case's workspace +
   * owner. Both tables are owned by THIS module, so the join crosses no boundary.
   */
  async recentRunsForOwner(
    workspaceId: string,
    ownerKind: EvalOwnerKind,
    ownerId: string,
    limit: number,
  ): Promise<{ run: EvalRunRow; caseName: string }[]> {
    const rows = await this.db
      .select({ run: t.evalRuns, caseName: t.evalCases.name })
      .from(t.evalRuns)
      .innerJoin(t.evalCases, eq(t.evalRuns.caseId, t.evalCases.id))
      .where(
        and(
          eq(t.evalCases.workspaceId, workspaceId),
          eq(t.evalCases.ownerKind, ownerKind),
          eq(t.evalCases.ownerId, ownerId),
        ),
      )
      .orderBy(desc(t.evalRuns.ranAt))
      .limit(limit);
    return rows.map((r) => ({ run: r.run, caseName: r.caseName }));
  }

  // ---- eval_batches -------------------------------------------------------

  async insertBatch(values: InsertEvalBatch): Promise<EvalBatchRow> {
    const [row] = await this.db
      .insert(t.evalBatches)
      .values({
        workspaceId: values.workspaceId,
        ownerKind: values.ownerKind,
        ownerId: values.ownerId,
        agentVersion: values.agentVersion,
        recall: values.recall,
        precision: values.precision,
        citationAccuracy: values.citationAccuracy,
        passRate: values.passRate,
        tracesPassed: values.tracesPassed,
        tracesTotal: values.tracesTotal,
        casesTotal: values.casesTotal,
        costUsd: values.costUsd,
        durationMs: values.durationMs,
      })
      .returning();
    return row!;
  }

  async getBatch(workspaceId: string, id: string): Promise<EvalBatchRow | undefined> {
    const [row] = await this.db
      .select()
      .from(t.evalBatches)
      .where(and(eq(t.evalBatches.workspaceId, workspaceId), eq(t.evalBatches.id, id)));
    return row;
  }

  /**
   * An owner's batches within `[from, to]` (inclusive on `ran_at`), chronological
   * (oldest→newest) for the trend line (AC-29). Uses `(owner_kind, owner_id,
   * ran_at)`.
   */
  batchesForOwner(
    workspaceId: string,
    ownerKind: EvalOwnerKind,
    ownerId: string,
    from: Date,
    to: Date,
  ): Promise<EvalBatchRow[]> {
    return this.db
      .select()
      .from(t.evalBatches)
      .where(
        and(
          eq(t.evalBatches.workspaceId, workspaceId),
          eq(t.evalBatches.ownerKind, ownerKind),
          eq(t.evalBatches.ownerId, ownerId),
          gte(t.evalBatches.ranAt, from),
          lte(t.evalBatches.ranAt, to),
        ),
      )
      .orderBy(asc(t.evalBatches.ranAt));
  }

  /** Most-recent batches across the workspace for a kind (dashboard `recent_batches`). */
  recentBatches(
    workspaceId: string,
    ownerKind: EvalOwnerKind,
    limit: number,
  ): Promise<EvalBatchRow[]> {
    return this.db
      .select()
      .from(t.evalBatches)
      .where(and(eq(t.evalBatches.workspaceId, workspaceId), eq(t.evalBatches.ownerKind, ownerKind)))
      .orderBy(desc(t.evalBatches.ranAt))
      .limit(limit);
  }

  /**
   * The single most-recent run of EACH given case (one row per case), for
   * batch-from-latest: the client has just run these cases, and we aggregate those
   * runs into one batch without re-invoking the model. One query ordered newest-first,
   * deduped to the first row per case in JS (caseIds is small — a panel's cases).
   */
  async latestRunsForCases(caseIds: readonly string[]): Promise<EvalRunRow[]> {
    if (caseIds.length === 0) return [];
    const rows = await this.db
      .select()
      .from(t.evalRuns)
      .where(inArray(t.evalRuns.caseId, [...caseIds]))
      .orderBy(desc(t.evalRuns.ranAt));
    const seen = new Set<string>();
    const latest: EvalRunRow[] = [];
    for (const r of rows) {
      if (seen.has(r.caseId)) continue;
      seen.add(r.caseId);
      latest.push(r);
    }
    return latest;
  }

  /** Tag runs with a batch id (batch-from-latest groups the just-run rows into its batch). */
  async attachRunsToBatch(runIds: readonly string[], batchId: string): Promise<void> {
    if (runIds.length === 0) return;
    await this.db
      .update(t.evalRuns)
      .set({ batchId })
      .where(inArray(t.evalRuns.id, [...runIds]));
  }

  /**
   * The distinct case names in a batch (via its runs). Used to LABEL a batch in the
   * recent-runs list: a 1-case batch shows that case's name, an N-case batch shows
   * "All (N)". Cheap — called only for the ≤10 batches in a recent list.
   */
  async caseNamesForBatch(batchId: string): Promise<string[]> {
    const rows = await this.db
      .selectDistinct({ name: t.evalCases.name })
      .from(t.evalRuns)
      .innerJoin(t.evalCases, eq(t.evalRuns.caseId, t.evalCases.id))
      .where(eq(t.evalRuns.batchId, batchId));
    return rows.map((r) => r.name);
  }
}
