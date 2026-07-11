import { and, eq } from 'drizzle-orm';
import type { Db } from '../../db/client.js';
import * as t from '../../db/schema.js';
import type { ConventionRow } from '../../db/rows.js';

export type { ConventionRow };

/**
 * Conventions data-access. Owns the `conventions` table — one row per extracted
 * house-rule candidate, scoped to a workspace + repo. Workspace-scoped throughout
 * (a convention never leaks across tenants). Extraction is destructive per repo:
 * a re-scan replaces the previous candidate set (see `replaceForRepo`).
 */

export interface InsertConvention {
  workspaceId: string;
  repoId: string;
  rule: string;
  evidencePath: string;
  evidenceSnippet: string;
  confidence: number;
}

export class ConventionsRepository {
  constructor(private db: Db) {}

  /**
   * A repo's name/fullName, scoped to the workspace. Used to (a) validate the repo
   * belongs to the tenant (undefined → 404) and (b) name the aggregated skill.
   */
  async repoRef(
    workspaceId: string,
    repoId: string,
  ): Promise<{ name: string; fullName: string } | undefined> {
    const [row] = await this.db
      .select({ name: t.repos.name, fullName: t.repos.fullName })
      .from(t.repos)
      .where(and(eq(t.repos.workspaceId, workspaceId), eq(t.repos.id, repoId)));
    return row;
  }

  /** All candidates for a repo (workspace-scoped), most confident first. */
  async listByRepo(workspaceId: string, repoId: string): Promise<ConventionRow[]> {
    return this.db
      .select()
      .from(t.conventions)
      .where(and(eq(t.conventions.workspaceId, workspaceId), eq(t.conventions.repoId, repoId)));
  }

  async getById(workspaceId: string, id: string): Promise<ConventionRow | undefined> {
    const [row] = await this.db
      .select()
      .from(t.conventions)
      .where(and(eq(t.conventions.workspaceId, workspaceId), eq(t.conventions.id, id)));
    return row;
  }

  /**
   * Replace this repo's candidate set with a freshly extracted one, atomically:
   * delete the old rows then insert the new. Returns the inserted rows. A re-scan
   * is a full replacement — accept/reject state from a prior scan is not carried
   * over (the evidence may have changed).
   */
  async replaceForRepo(
    workspaceId: string,
    repoId: string,
    rows: InsertConvention[],
  ): Promise<ConventionRow[]> {
    return this.db.transaction(async (tx) => {
      await tx
        .delete(t.conventions)
        .where(and(eq(t.conventions.workspaceId, workspaceId), eq(t.conventions.repoId, repoId)));
      if (rows.length === 0) return [];
      return tx
        .insert(t.conventions)
        .values(
          rows.map((r) => ({
            workspaceId: r.workspaceId,
            repoId: r.repoId,
            rule: r.rule,
            evidencePath: r.evidencePath,
            evidenceSnippet: r.evidenceSnippet,
            confidence: r.confidence,
            accepted: false,
          })),
        )
        .returning();
    });
  }

  /** Patch a candidate's accepted flag and/or rule text (workspace-scoped). */
  async update(
    workspaceId: string,
    id: string,
    patch: { accepted?: boolean; rule?: string },
  ): Promise<ConventionRow | undefined> {
    const [row] = await this.db
      .update(t.conventions)
      .set({
        ...(patch.accepted !== undefined ? { accepted: patch.accepted } : {}),
        ...(patch.rule !== undefined ? { rule: patch.rule } : {}),
      })
      .where(and(eq(t.conventions.workspaceId, workspaceId), eq(t.conventions.id, id)))
      .returning();
    return row;
  }

  /** Reject = remove the candidate so it disappears from the list. */
  async remove(workspaceId: string, id: string): Promise<boolean> {
    const rows = await this.db
      .delete(t.conventions)
      .where(and(eq(t.conventions.workspaceId, workspaceId), eq(t.conventions.id, id)))
      .returning({ id: t.conventions.id });
    return rows.length > 0;
  }
}
