import { readFile, realpath } from 'node:fs/promises';
import { join, sep } from 'node:path';
import { and, eq, isNotNull } from 'drizzle-orm';
import type { Db } from '../../db/client.js';
import * as t from '../../db/schema.js';
import { walkContextDocs, type WalkedDoc } from './walk.js';

/**
 * project-context data-access (INFRA ring). Two jobs, both workspace-scoped:
 *   1. resolve the repo's clone path (so discovery reads THAT repo's clone), and
 *      walk its configured roots for `.md` (fs I/O confined to this ring); and
 *   2. gather the workspace's persisted `context_docs` path-lists off `agents` /
 *      `skills` so the service can tally per-path `used_by` counts.
 * It never reads or writes document TEXT — only paths (SPEC-01 AC-7).
 */
export class ProjectContextRepository {
  constructor(private db: Db) {}

  /**
   * The clone path of a repo, scoped to `workspaceId`. Returns null when the repo
   * isn't in this workspace OR has never been cloned — either way discovery yields
   * an empty list (AC-2) and no cross-tenant clone is ever read.
   */
  async getClonePath(workspaceId: string, repoId: string): Promise<string | null> {
    const [row] = await this.db
      .select({ clonePath: t.repos.clonePath })
      .from(t.repos)
      .where(and(eq(t.repos.workspaceId, workspaceId), eq(t.repos.id, repoId)));
    return row?.clonePath ?? null;
  }

  /** Walk the configured roots of a clone for `.md` docs (delegates to walk.ts). */
  async walkDocs(clonePath: string, roots: readonly string[]): Promise<WalkedDoc[]> {
    return walkContextDocs(clonePath, roots);
  }

  /**
   * Read one document's utf-8 body from a resolved clone, CONFINED to the clone
   * root on disk. The caller (`service.ts`) already gates `relPath` with
   * `isSafeRepoPath`, but that is a path-STRING check and cannot catch an on-disk
   * symlink that escapes the clone (e.g. a committed `docs/x.md -> /etc/passwd`).
   * So we resolve both the clone root and the target through `realpath` and only
   * read when the real target stays inside the real root. Anything else — an
   * absent path (`realpath` throws), a symlink escape, or an unreadable file —
   * resolves to `null` so the caller maps it to a clean 404, never a 500 and never
   * a read outside the clone.
   */
  async readDocBody(clonePath: string, relPath: string): Promise<string | null> {
    try {
      const base = await realpath(clonePath);
      const target = await realpath(join(clonePath, relPath));
      if (target !== base && !target.startsWith(base + sep)) return null;
      return await readFile(target, 'utf-8');
    } catch {
      return null;
    }
  }

  /**
   * Every non-null `context_docs` path-list persisted in the workspace, split by
   * owner kind. The service tallies these into per-path `used_by` counts — kept
   * as a raw fetch here so the tally itself stays a pure, unit-testable function.
   */
  async getContextDocLists(
    workspaceId: string,
  ): Promise<{ agents: string[][]; skills: string[][] }> {
    const [agentRows, skillRows] = await Promise.all([
      this.db
        .select({ contextDocs: t.agents.contextDocs })
        .from(t.agents)
        .where(and(eq(t.agents.workspaceId, workspaceId), isNotNull(t.agents.contextDocs))),
      this.db
        .select({ contextDocs: t.skills.contextDocs })
        .from(t.skills)
        .where(and(eq(t.skills.workspaceId, workspaceId), isNotNull(t.skills.contextDocs))),
    ]);
    return {
      agents: agentRows.map((r) => r.contextDocs ?? []),
      skills: skillRows.map((r) => r.contextDocs ?? []),
    };
  }
}
