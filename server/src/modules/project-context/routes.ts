import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { ContextDocContent, ContextDocList } from '@devdigest/shared';
import { getContext } from '../_shared/context.js';
import { ProjectContextService } from './service.js';

/**
 * project-context module — Project-context document discovery.
 *   GET /repos/:repoId/context-docs → every `.md` under the configured roots of
 *     the repo's clone, with token counts + live `used_by` tallies (AC-1..AC-4).
 *
 * Schema-first: `repoId` must be a uuid and the response is serialized through
 * `ContextDocList`, so a bad id is rejected 422 before the handler and any stray
 * key (e.g. a document body) would be stripped rather than leak.
 *
 *   GET /repos/:repoId/context-docs/content?path=<repo-relative> → ONE document's
 *     body as `ContextDocContent { path, body }`, read lazily for preview (AC-6).
 *     The `path` is validated by `isSafeRepoPath` in the service BEFORE any read;
 *     an unsafe / non-`.md` / absent path yields a clean 404 (NotFoundError), never
 *     a 500 and never a read outside the workspace-scoped clone root.
 *
 * The route owns discovery even though the underlying data (the clone) is a
 * `repos`/repo-intel concern — same shape as the blast-radius route living in
 * `pulls/`: the module that owns the READ need not own the data.
 */
const RepoParams = z.object({ repoId: z.string().uuid() });
const ContentQuery = z.object({ path: z.string() });

export default async function projectContextRoutes(appBase: FastifyInstance) {
  const app = appBase.withTypeProvider<ZodTypeProvider>();
  const service = new ProjectContextService(app.container);

  app.get(
    '/repos/:repoId/context-docs',
    { schema: { params: RepoParams, response: { 200: ContextDocList } } },
    async (req) => {
      const { workspaceId } = await getContext(app.container, req);
      return service.listContextDocs(workspaceId, req.params.repoId);
    },
  );

  // Lazy single-document body for preview (AC-6). One Zod contract drives BOTH
  // request validation (non-uuid `repoId` or missing `path` → 422 before the
  // handler) and response serialization (`ContextDocContent` strips any stray
  // key). The security gate + 404 mapping live in the service; the handler stays
  // thin. `NotFoundError` propagates to the global error handler → 404.
  app.get(
    '/repos/:repoId/context-docs/content',
    { schema: { params: RepoParams, querystring: ContentQuery, response: { 200: ContextDocContent } } },
    async (req) => {
      const { workspaceId } = await getContext(app.container, req);
      return service.getContextDocContent(workspaceId, req.params.repoId, req.query.path);
    },
  );
}
