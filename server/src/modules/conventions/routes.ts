import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { getContext } from '../_shared/context.js';
import { IdParams } from '../_shared/schemas.js';
import { NotFoundError } from '../../platform/errors.js';
import { ConventionsService } from './service.js';

/**
 * Conventions module — extract house-style rules from a repo's clone and turn
 * the accepted ones into a reusable skill.
 *   POST   /repos/:id/conventions/extract      → scan the clone, return grounded candidates
 *   GET    /repos/:id/conventions              → list persisted candidates for the repo
 *   GET    /repos/:id/conventions/skill-draft  → merged, UNSAVED skill draft (accepted rules)
 *   PATCH  /conventions/:id                    → accept / edit a candidate
 *   DELETE /conventions/:id                    → reject (removes it from the list)
 *
 * Extraction is grounded: the service discards any candidate whose cited file/line
 * evidence can't be verified against the sampled clone files. The draft persists
 * nothing — the client edits it then confirms via `POST /skills`.
 */

const PatchConventionBody = z.object({
  accepted: z.boolean().optional(),
  rule: z.string().min(1).optional(),
});

export default async function conventionsRoutes(appBase: FastifyInstance) {
  const app = appBase.withTypeProvider<ZodTypeProvider>();
  const service = new ConventionsService(app.container);

  app.post(
    '/repos/:id/conventions/extract',
    { schema: { params: IdParams } },
    async (req) => {
      const { workspaceId } = await getContext(app.container, req);
      const candidates = await service.extract(workspaceId, req.params.id, (m) => req.log.info(m));
      if (candidates === undefined) throw new NotFoundError('Repo not found');
      return candidates;
    },
  );

  app.get('/repos/:id/conventions', { schema: { params: IdParams } }, async (req) => {
    const { workspaceId } = await getContext(app.container, req);
    const candidates = await service.list(workspaceId, req.params.id);
    if (candidates === undefined) throw new NotFoundError('Repo not found');
    return candidates;
  });

  app.get(
    '/repos/:id/conventions/skill-draft',
    { schema: { params: IdParams } },
    async (req) => {
      const { workspaceId } = await getContext(app.container, req);
      const draft = await service.skillDraft(workspaceId, req.params.id);
      if (draft === undefined) throw new NotFoundError('Repo not found');
      return draft;
    },
  );

  app.patch(
    '/conventions/:id',
    { schema: { params: IdParams, body: PatchConventionBody } },
    async (req) => {
      const { workspaceId } = await getContext(app.container, req);
      const b = req.body;
      const updated = await service.accept(workspaceId, req.params.id, {
        ...(b.accepted !== undefined ? { accepted: b.accepted } : {}),
        ...(b.rule !== undefined ? { rule: b.rule } : {}),
      });
      if (!updated) throw new NotFoundError('Convention not found');
      return updated;
    },
  );

  app.delete('/conventions/:id', { schema: { params: IdParams } }, async (req) => {
    const { workspaceId } = await getContext(app.container, req);
    const ok = await service.reject(workspaceId, req.params.id);
    if (!ok) throw new NotFoundError('Convention not found');
    return { deleted: req.params.id };
  });
}
