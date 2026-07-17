import { and, asc, desc, eq, sql } from 'drizzle-orm';
import type { Db } from '../../db/client.js';
import * as t from '../../db/schema.js';
import type { SkillSource, SkillType } from '@devdigest/shared';
import { INITIAL_SKILL_VERSION } from './constants.js';
import { bodyChanged } from './helpers.js';

/**
 * Skills data-access. Owns `skills` and the `skill_versions` content-history
 * table. Workspace-scoped throughout (a skill is shared across a workspace's
 * agents, never across tenants). The `agent_skills` link table is owned by the
 * agents repository — this module never touches the agent side.
 */

import type { SkillRow, SkillVersionRow } from '../../db/rows.js';
export type { SkillRow, SkillVersionRow };

export interface InsertSkill {
  workspaceId: string;
  name: string;
  description: string;
  type: SkillType;
  source: SkillSource;
  body: string;
  enabled?: boolean;
  evidenceFiles?: string[] | null;
  /** Optional "what changed" note recorded on the v1 snapshot. */
  message?: string | null;
}

export interface UpdateSkill {
  name?: string;
  description?: string;
  type?: SkillType;
  body?: string;
  enabled?: boolean;
  evidenceFiles?: string[] | null;
  /** Optional "what changed" note recorded on the new snapshot (body changes only). */
  message?: string | null;
}

export class SkillsRepository {
  constructor(private db: Db) {}

  async list(workspaceId: string): Promise<SkillRow[]> {
    return this.db.select().from(t.skills).where(eq(t.skills.workspaceId, workspaceId));
  }

  async getById(workspaceId: string, id: string): Promise<SkillRow | undefined> {
    const [row] = await this.db
      .select()
      .from(t.skills)
      .where(and(eq(t.skills.workspaceId, workspaceId), eq(t.skills.id, id)));
    return row;
  }

  /** Delete a skill (scoped to workspace). Versions + agent_skills links cascade. */
  async deleteById(workspaceId: string, id: string): Promise<boolean> {
    const rows = await this.db
      .delete(t.skills)
      .where(and(eq(t.skills.workspaceId, workspaceId), eq(t.skills.id, id)))
      .returning({ id: t.skills.id });
    return rows.length > 0;
  }

  /** Insert a skill AND record version 1 in skill_versions (immutable body snapshot). */
  async insert(values: InsertSkill): Promise<SkillRow> {
    const [row] = await this.db
      .insert(t.skills)
      .values({
        workspaceId: values.workspaceId,
        name: values.name,
        description: values.description,
        type: values.type,
        source: values.source,
        body: values.body,
        enabled: values.enabled ?? true,
        version: INITIAL_SKILL_VERSION,
        evidenceFiles: values.evidenceFiles ?? null,
      })
      .returning();
    await this.snapshotVersion(row!, INITIAL_SKILL_VERSION, values.message ?? null);
    return row!;
  }

  /**
   * Update a skill. A `body` change bumps the version and snapshots the new body
   * into skill_versions (metadata-only edits — name/type/description/enabled —
   * keep the same version).
   */
  async update(
    workspaceId: string,
    id: string,
    patch: UpdateSkill,
  ): Promise<SkillRow | undefined> {
    const existing = await this.getById(workspaceId, id);
    if (!existing) return undefined;

    const contentChanged = bodyChanged(existing, patch);
    const nextVersion = contentChanged ? existing.version + 1 : existing.version;

    const [row] = await this.db
      .update(t.skills)
      .set({
        ...(patch.name !== undefined ? { name: patch.name } : {}),
        ...(patch.description !== undefined ? { description: patch.description } : {}),
        ...(patch.type !== undefined ? { type: patch.type } : {}),
        ...(patch.body !== undefined ? { body: patch.body } : {}),
        ...(patch.enabled !== undefined ? { enabled: patch.enabled } : {}),
        ...(patch.evidenceFiles !== undefined ? { evidenceFiles: patch.evidenceFiles } : {}),
        ...(contentChanged ? { version: nextVersion } : {}),
      })
      .where(and(eq(t.skills.workspaceId, workspaceId), eq(t.skills.id, id)))
      .returning();

    if (contentChanged && row) await this.snapshotVersion(row, nextVersion, patch.message ?? null);
    return row;
  }

  private async snapshotVersion(
    row: SkillRow,
    version: number,
    message: string | null,
  ): Promise<void> {
    await this.db
      .insert(t.skillVersions)
      .values({ skillId: row.id, version, body: row.body, message })
      .onConflictDoNothing();
  }

  /** All body snapshots for a skill, newest version first. */
  async listVersions(skillId: string): Promise<SkillVersionRow[]> {
    return this.db
      .select()
      .from(t.skillVersions)
      .where(eq(t.skillVersions.skillId, skillId))
      .orderBy(desc(t.skillVersions.version));
  }

  /** One body snapshot, or undefined if that version was never recorded. */
  async getVersion(skillId: string, version: number): Promise<SkillVersionRow | undefined> {
    const [row] = await this.db
      .select()
      .from(t.skillVersions)
      .where(and(eq(t.skillVersions.skillId, skillId), eq(t.skillVersions.version, version)));
    return row;
  }

  /**
   * Restore an old version's body as the current body. Reuses `update` so it goes
   * through the normal version-bump + snapshot path (a new version is created with
   * the given message). Returns undefined when the skill/version isn't found.
   */
  async restore(
    workspaceId: string,
    id: string,
    version: number,
    message: string | null,
  ): Promise<SkillRow | undefined> {
    const snapshot = await this.getVersion(id, version);
    if (!snapshot) return undefined;
    return this.update(workspaceId, id, { body: snapshot.body, message });
  }

  /** Map of skillId → number of agents it's linked to (workspace-scoped). */
  async usedByCounts(workspaceId: string): Promise<Map<string, number>> {
    const rows = await this.db
      .select({ skillId: t.agentSkills.skillId, count: sql<number>`count(*)::int` })
      .from(t.agentSkills)
      .innerJoin(t.skills, eq(t.agentSkills.skillId, t.skills.id))
      .where(eq(t.skills.workspaceId, workspaceId))
      .groupBy(t.agentSkills.skillId);
    return new Map(rows.map((r) => [r.skillId, r.count]));
  }

  /**
   * Replace the skill's attached Project-context docs with `paths` (ordered).
   * Metadata-only (no body change) so it does NOT bump the version or snapshot
   * `skill_versions`. Workspace-scoped; undefined when the skill isn't found.
   */
  async setContextDocs(
    workspaceId: string,
    id: string,
    paths: string[],
  ): Promise<SkillRow | undefined> {
    const [row] = await this.db
      .update(t.skills)
      .set({ contextDocs: paths })
      .where(and(eq(t.skills.workspaceId, workspaceId), eq(t.skills.id, id)))
      .returning();
    return row;
  }

  /** Agents that link this skill, by name. Used by the skill Stats tab. */
  async agentsUsing(skillId: string): Promise<{ id: string; name: string }[]> {
    return this.db
      .select({ id: t.agents.id, name: t.agents.name })
      .from(t.agentSkills)
      .innerJoin(t.agents, eq(t.agentSkills.agentId, t.agents.id))
      .where(eq(t.agentSkills.skillId, skillId))
      .orderBy(asc(t.agents.name));
  }
}
