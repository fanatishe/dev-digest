import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { SkillType } from '@devdigest/shared';
import { getContext } from '../_shared/context.js';
import { IdParams } from '../_shared/schemas.js';
import { NotFoundError, ValidationError } from '../../platform/errors.js';
import { SkillsService } from './service.js';
import { previewFromMarkdown, SkillImportError } from './import.js';

/**
 * Skills module — reusable prompt blocks shared across agents.
 *   GET    /skills              → list (workspace-scoped)
 *   GET    /skills/:id          → one skill
 *   POST   /skills              → create (also the "confirm" step after an import)
 *   PUT    /skills/:id          → update; a body change snapshots a new version
 *   DELETE /skills/:id          → delete (versions + agent links cascade)
 *   GET    /skills/:id/versions → body history (newest first)
 *   POST   /skills/:id/restore  → restore an old version's body as current
 *   GET    /skills/:id/stats    → usage stats (agents linking this skill)
 *   POST   /skills/import       → extract a preview from a .md/.zip/URL (persists nothing)
 *
 * Import is a TRUST BOUNDARY: nothing is executed and nothing is saved until the
 * user confirms. See ./import.ts.
 */

const CreateSkillBody = z.object({
  name: z.string().min(1),
  description: z.string(),
  type: SkillType,
  source: z.enum(['manual', 'imported_url', 'extracted', 'community']).optional(),
  body: z.string().min(1),
  enabled: z.boolean().optional(),
  evidence_files: z.array(z.string()).nullish(),
  message: z.string().optional(),
});

const UpdateSkillBody = z.object({
  name: z.string().min(1).optional(),
  description: z.string().optional(),
  type: SkillType.optional(),
  body: z.string().min(1).optional(),
  enabled: z.boolean().optional(),
  evidence_files: z.array(z.string()).nullish(),
  message: z.string().optional(),
});

const RestoreBody = z.object({
  version: z.coerce.number().int().positive(),
  message: z.string().optional(),
});

/** Import source: a pasted/uploaded markdown file, a base64 .zip, or a URL. */
const ImportBody = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('markdown'),
    content: z.string().min(1),
    filename: z.string().optional(),
    name: z.string().optional(),
  }),
  z.object({
    kind: z.literal('archive'),
    content_base64: z.string().min(1),
    name: z.string().optional(),
  }),
  z.object({
    kind: z.literal('url'),
    url: z.string().url(),
    name: z.string().optional(),
  }),
]);

/** Cap a server-side URL fetch so a huge/hostile response can't blow up memory. */
const MAX_URL_BYTES = 1_000_000;

export default async function skillsRoutes(appBase: FastifyInstance) {
  const app = appBase.withTypeProvider<ZodTypeProvider>();
  const service = new SkillsService(app.container);

  app.get('/skills', async (req) => {
    const { workspaceId } = await getContext(app.container, req);
    return service.list(workspaceId);
  });

  app.get('/skills/:id', { schema: { params: IdParams } }, async (req) => {
    const { workspaceId } = await getContext(app.container, req);
    const skill = await service.get(workspaceId, req.params.id);
    if (!skill) throw new NotFoundError('Skill not found');
    return skill;
  });

  app.post('/skills', { schema: { body: CreateSkillBody } }, async (req, reply) => {
    const { workspaceId } = await getContext(app.container, req);
    const b = req.body;
    const skill = await service.create(workspaceId, {
      name: b.name,
      description: b.description,
      type: b.type,
      body: b.body,
      ...(b.source !== undefined ? { source: b.source } : {}),
      ...(b.enabled !== undefined ? { enabled: b.enabled } : {}),
      ...(b.evidence_files !== undefined ? { evidence_files: b.evidence_files ?? null } : {}),
      ...(b.message !== undefined ? { message: b.message } : {}),
    });
    reply.status(201);
    return skill;
  });

  app.put(
    '/skills/:id',
    { schema: { params: IdParams, body: UpdateSkillBody } },
    async (req) => {
      const { workspaceId } = await getContext(app.container, req);
      const b = req.body;
      const skill = await service.update(workspaceId, req.params.id, {
        ...(b.name !== undefined ? { name: b.name } : {}),
        ...(b.description !== undefined ? { description: b.description } : {}),
        ...(b.type !== undefined ? { type: b.type } : {}),
        ...(b.body !== undefined ? { body: b.body } : {}),
        ...(b.enabled !== undefined ? { enabled: b.enabled } : {}),
        ...(b.evidence_files !== undefined ? { evidence_files: b.evidence_files ?? null } : {}),
        ...(b.message !== undefined ? { message: b.message } : {}),
      });
      if (!skill) throw new NotFoundError('Skill not found');
      return skill;
    },
  );

  app.delete('/skills/:id', { schema: { params: IdParams } }, async (req) => {
    const { workspaceId } = await getContext(app.container, req);
    const ok = await service.delete(workspaceId, req.params.id);
    if (!ok) throw new NotFoundError('Skill not found');
    return { ok: true };
  });

  app.get('/skills/:id/versions', { schema: { params: IdParams } }, async (req) => {
    const { workspaceId } = await getContext(app.container, req);
    const versions = await service.listVersions(workspaceId, req.params.id);
    if (!versions) throw new NotFoundError('Skill not found');
    return versions;
  });

  // Restore an old version's body as current (creates a new version). 404 when the
  // skill isn't in the workspace; a missing version returns the skill unchanged.
  app.post(
    '/skills/:id/restore',
    { schema: { params: IdParams, body: RestoreBody } },
    async (req) => {
      const { workspaceId } = await getContext(app.container, req);
      const skill = await service.restore(
        workspaceId,
        req.params.id,
        req.body.version,
        req.body.message,
      );
      if (!skill) throw new NotFoundError('Skill not found');
      return skill;
    },
  );

  app.get('/skills/:id/stats', { schema: { params: IdParams } }, async (req) => {
    const { workspaceId } = await getContext(app.container, req);
    const stats = await service.stats(workspaceId, req.params.id);
    if (!stats) throw new NotFoundError('Skill not found');
    return stats;
  });

  // Import is extract-only and saves nothing. A larger body limit than the global
  // 1 MB covers a base64-encoded .zip; the extractor still caps what it reads.
  app.post(
    '/skills/import',
    { bodyLimit: 8 * 1024 * 1024, schema: { body: ImportBody } },
    async (req) => {
      await getContext(app.container, req);
      const input = req.body;
      try {
        if (input.kind === 'url') {
          const content = await fetchUrlText(input.url);
          return previewFromMarkdown({
            content,
            source: 'imported_url',
            ...(input.name ? { name: input.name } : {}),
          });
        }
        return service.preview(input);
      } catch (err) {
        if (err instanceof SkillImportError) throw new ValidationError(err.message);
        throw err;
      }
    },
  );
}

/** Fetch a URL's text server-side (http/https only, size-capped). */
async function fetchUrlText(url: string): Promise<string> {
  const parsed = new URL(url);
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new SkillImportError('Only http(s) URLs can be imported.');
  }
  const res = await fetch(url, { redirect: 'follow' });
  if (!res.ok) throw new SkillImportError(`Could not fetch the URL (HTTP ${res.status}).`);
  const text = await res.text();
  if (text.length > MAX_URL_BYTES) throw new SkillImportError('The fetched document is too large.');
  return text;
}
