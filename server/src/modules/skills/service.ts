import type { Container } from '../../platform/container.js';
import type { Skill, SkillSource, SkillType } from '@devdigest/shared';
import { SkillsRepository } from './repository.js';
import { toSkillDto } from './helpers.js';
import {
  previewFromArchive,
  previewFromMarkdown,
  type SkillPreview,
} from './import.js';

/**
 * Skills service. Business logic for the Skills page (CRUD) and the import flow.
 *
 * A skill is reusable text + config. Its `body` is appended to an agent's prompt
 * at review time by the reviews run-executor (only when the skill is enabled AND
 * linked to that agent). Editing the body creates a new immutable version.
 */

export { toSkillDto } from './helpers.js';

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

export interface UpdateSkillInput {
  name?: string;
  description?: string;
  type?: SkillType;
  body?: string;
  enabled?: boolean;
  evidence_files?: string[] | null;
  message?: string;
}

/** Version history row + optional "what changed" message. */
export interface SkillVersionDto {
  skill_id: string;
  version: number;
  body: string;
  message: string | null;
  created_at: string;
}

/** Usage stats for the skill Stats tab. */
export interface SkillStats {
  used_by: number;
  agents: { id: string; name: string }[];
}

export class SkillsService {
  private repo: SkillsRepository;

  constructor(private container: Container) {
    this.repo = new SkillsRepository(container.db);
  }

  async list(workspaceId: string): Promise<Skill[]> {
    const [rows, counts] = await Promise.all([
      this.repo.list(workspaceId),
      this.repo.usedByCounts(workspaceId),
    ]);
    return rows.map((row) => ({ ...toSkillDto(row), used_by: counts.get(row.id) ?? 0 }));
  }

  async get(workspaceId: string, id: string): Promise<Skill | undefined> {
    const row = await this.repo.getById(workspaceId, id);
    return row ? toSkillDto(row) : undefined;
  }

  async delete(workspaceId: string, id: string): Promise<boolean> {
    return this.repo.deleteById(workspaceId, id);
  }

  async create(workspaceId: string, input: CreateSkillInput): Promise<Skill> {
    const row = await this.repo.insert({
      workspaceId,
      name: input.name,
      description: input.description,
      type: input.type,
      source: input.source ?? 'manual',
      body: input.body,
      ...(input.enabled !== undefined ? { enabled: input.enabled } : {}),
      ...(input.evidence_files !== undefined ? { evidenceFiles: input.evidence_files } : {}),
      ...(input.message !== undefined ? { message: input.message } : {}),
    });
    return toSkillDto(row);
  }

  async update(
    workspaceId: string,
    id: string,
    patch: UpdateSkillInput,
  ): Promise<Skill | undefined> {
    const row = await this.repo.update(workspaceId, id, {
      ...(patch.name !== undefined ? { name: patch.name } : {}),
      ...(patch.description !== undefined ? { description: patch.description } : {}),
      ...(patch.type !== undefined ? { type: patch.type } : {}),
      ...(patch.body !== undefined ? { body: patch.body } : {}),
      ...(patch.enabled !== undefined ? { enabled: patch.enabled } : {}),
      ...(patch.evidence_files !== undefined ? { evidenceFiles: patch.evidence_files } : {}),
      ...(patch.message !== undefined ? { message: patch.message } : {}),
    });
    return row ? toSkillDto(row) : undefined;
  }

  /** Version (body) history for a skill, newest first. Undefined when not in workspace. */
  async listVersions(workspaceId: string, skillId: string): Promise<SkillVersionDto[] | undefined> {
    const skill = await this.repo.getById(workspaceId, skillId);
    if (!skill) return undefined;
    const rows = await this.repo.listVersions(skillId);
    return rows.map((r) => ({
      skill_id: r.skillId,
      version: r.version,
      body: r.body,
      message: r.message ?? null,
      created_at: r.createdAt.toISOString(),
    }));
  }

  /**
   * Restore an old version's body as the current body (creates a new version with
   * an optional message). Undefined when the skill/version isn't in this workspace.
   */
  async restore(
    workspaceId: string,
    skillId: string,
    version: number,
    message?: string,
  ): Promise<Skill | undefined> {
    const skill = await this.repo.getById(workspaceId, skillId);
    if (!skill) return undefined;
    const row = await this.repo.restore(
      workspaceId,
      skillId,
      version,
      message ?? `Restored from v${version}`,
    );
    return row ? toSkillDto(row) : undefined;
  }

  /**
   * Replace the skill's attached Project-context docs with an ordered path list
   * (attach / detach / reorder collapse to "set the list"). Workspace-scoped:
   * undefined when the skill isn't in this workspace (route → 404). Persists
   * PATHS only — no document text is ever written (AC-7 / AC-9).
   */
  async setContextDocs(
    workspaceId: string,
    id: string,
    paths: string[],
  ): Promise<Skill | undefined> {
    const row = await this.repo.setContextDocs(workspaceId, id, paths);
    return row ? toSkillDto(row) : undefined;
  }

  /** Usage stats (agents linking this skill). Undefined when not in workspace. */
  async stats(workspaceId: string, skillId: string): Promise<SkillStats | undefined> {
    const skill = await this.repo.getById(workspaceId, skillId);
    if (!skill) return undefined;
    const agents = await this.repo.agentsUsing(skillId);
    return { used_by: agents.length, agents };
  }

  /**
   * Build an import PREVIEW — extract-only, persist nothing. The caller (route)
   * validates the input shape; this picks the right extractor. `.zip` archives
   * are handed to the archive extractor which only ever reads markdown.
   */
  preview(input:
    | { kind: 'markdown'; content: string; filename?: string; name?: string }
    | { kind: 'archive'; content_base64: string; name?: string }
    | { kind: 'url'; content: string; url: string; name?: string }): SkillPreview {
    if (input.kind === 'archive') {
      const buf = Buffer.from(input.content_base64, 'base64');
      return previewFromArchive(buf, input.name);
    }
    const source = input.kind === 'url' ? 'imported_url' : 'extracted';
    const filename = input.kind === 'markdown' ? input.filename : undefined;
    return previewFromMarkdown({ content: input.content, source, ...(filename ? { filename } : {}), ...(input.name ? { name: input.name } : {}) });
  }
}
