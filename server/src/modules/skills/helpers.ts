import type { Skill, SkillSource, SkillType } from '@devdigest/shared';
import type { SkillRow } from '../../db/rows.js';

/**
 * Pure helpers for the skills module — DB row ⇄ DTO mapping and the
 * content-version-bump rule. No I/O.
 *
 * A skill is reusable, user-editable text + config (no executable behavior). It
 * is attached to agents by the agents module (`agent_skills`) and its `body` is
 * appended to the agent's prompt at review time.
 */

/** Map a persisted skill row to the public `Skill` DTO. */
export function toSkillDto(row: SkillRow): Skill {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    type: row.type as SkillType,
    source: row.source as SkillSource,
    body: row.body,
    enabled: row.enabled,
    version: row.version,
    evidence_files: row.evidenceFiles ?? null,
    context_docs: row.contextDocs ?? null,
  };
}

/**
 * True when a patch changes the skill's `body` relative to the existing row. Only
 * a body change bumps the version and snapshots `skill_versions` (name/type/
 * description/enabled edits don't create a new immutable content version — they
 * are metadata about the same body).
 */
export function bodyChanged(existing: Pick<SkillRow, 'body'>, patch: { body?: string }): boolean {
  return patch.body !== undefined && patch.body !== existing.body;
}
