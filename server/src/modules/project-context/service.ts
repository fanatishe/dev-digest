import { extname } from 'node:path';
import type { Container } from '../../platform/container.js';
import type { ContextDocContent, ContextDocList } from '@devdigest/shared';
import { NotFoundError } from '../../platform/errors.js';
import { isSafeRepoPath } from '../reviews/intent-helpers.js';
import { CONTEXT_DOC_EXT } from './constants.js';
import { ProjectContextRepository } from './repository.js';

/**
 * project-context service (APPLICATION ring). Orchestrates discovery of a repo's
 * attachable `.md` docs: resolves the (workspace-scoped) clone via the repository,
 * walks it (infra), counts tokens through the `container.tokenizer` PORT (never a
 * concrete class), tallies per-path `used_by` across the workspace, and maps the
 * result to the `ContextDocList` contract. `token_budget` is echoed from config so
 * the editor can flag an over-budget attachment set (AC-11).
 *
 * Only PATHS + token counts cross the contract — document bodies stay in-process.
 */

/**
 * Pure tally: given the workspace's persisted `context_docs` path-lists, count how
 * many lists reference each path. A path listed twice by ONE owner counts once for
 * that owner (dedup per list) — `used_by` is "how many agents/skills attach this
 * doc", not "how many times". Kept pure + exported so it is unit-testable with no
 * DB (AC-4).
 */
export function tallyUsedBy(lists: readonly (readonly string[])[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const list of lists) {
    for (const path of new Set(list)) {
      counts.set(path, (counts.get(path) ?? 0) + 1);
    }
  }
  return counts;
}

export class ProjectContextService {
  private repo: ProjectContextRepository;

  constructor(private container: Container) {
    this.repo = new ProjectContextRepository(container.db);
  }

  /**
   * List every `.md` under the configured roots of `repoId`'s clone, each with a
   * token count and live `used_by` tallies. Workspace-scoped: a repo outside the
   * workspace, or one that was never cloned/unreadable, yields `{ docs: [] }` (AC-2).
   */
  async listContextDocs(workspaceId: string, repoId: string): Promise<ContextDocList> {
    const { projectContextRoots, projectContextTokenBudget } = this.container.config;
    const clonePath = await this.repo.getClonePath(workspaceId, repoId);
    if (!clonePath) return { docs: [], token_budget: projectContextTokenBudget };

    const [walked, lists] = await Promise.all([
      this.repo.walkDocs(clonePath, projectContextRoots),
      this.repo.getContextDocLists(workspaceId),
    ]);
    const usedByAgents = tallyUsedBy(lists.agents);
    const usedBySkills = tallyUsedBy(lists.skills);

    const docs = walked.map((d) => ({
      path: d.path,
      root: d.root,
      tokens: this.container.tokenizer.count(d.body),
      used_by_agents: usedByAgents.get(d.path) ?? 0,
      used_by_skills: usedBySkills.get(d.path) ?? 0,
    }));
    return { docs, token_budget: projectContextTokenBudget };
  }

  /**
   * Lazily read ONE document's body for preview (AC-6). Security seam lives here,
   * in the application ring, BEFORE any filesystem read (onion: fs I/O stays in
   * the infra `repository`/`walk` ring):
   *   1. `getClonePath(workspaceId, repoId)` — workspace-scoped, so a user-supplied
   *      `repoId` can never resolve another tenant's clone.
   *   2. `isSafeRepoPath(path)` — the ONLY guard against `../../etc/passwd`
   *      traversal (the repository reader does a plain, unconfined `join`).
   *   3. `.md`-only — defense-in-depth matching the discovery boundary.
   * Any failed check (unknown repo, unsafe path, non-`.md`, absent file) throws
   * `NotFoundError` → a clean 404, never a 500 and never a read outside the clone.
   */
  async getContextDocContent(
    workspaceId: string,
    repoId: string,
    path: string,
  ): Promise<ContextDocContent> {
    const clonePath = await this.repo.getClonePath(workspaceId, repoId);
    if (!clonePath) throw new NotFoundError('Document not found');

    if (!isSafeRepoPath(path)) throw new NotFoundError('Document not found');
    if (extname(path).toLowerCase() !== CONTEXT_DOC_EXT) {
      throw new NotFoundError('Document not found');
    }

    const body = await this.repo.readDocBody(clonePath, path);
    if (body === null) throw new NotFoundError('Document not found');

    return { path, body };
  }
}
