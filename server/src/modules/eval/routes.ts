import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { EvalCaseInput, EvalOwnerKind } from '@devdigest/shared';
import { getContext } from '../_shared/context.js';
import { IdParams } from '../_shared/schemas.js';
import { NotFoundError } from '../../platform/errors.js';
import { EvalService } from './service.js';
import { DEFAULT_RUNS_LIMIT, DEFAULT_RUN_TIMES } from './constants.js';

/**
 * Eval module (L06) — regression-testing for reviewer agents & skills.
 *
 *   GET    /eval/cases?owner_kind&owner_id        → case + last run + repro per row
 *   POST   /eval/cases                            → create a case
 *   GET/PUT/DELETE /eval/cases/:id                → read / update / delete a case
 *   POST   /eval/cases/:id/run { times? }         → ad-hoc "Run N×" (batch_id null)
 *   GET    /eval/cases/:id/runs?limit             → runs newest-first (ReproRateBadge)
 *   POST   /agents/:id/eval/run-all { version? }  → one batch (agents)
 *   POST   /skills/:id/eval/run-all { version? }  → one batch (skills)
 *   GET    /agents|skills/:id/eval/dashboard?from&to → per-owner detail (trend)
 *   GET    /eval/dashboard                        → all-agents dashboard (agents only)
 *   POST   /eval/dashboard/run-all                → run-all for every agent with cases
 *   GET    /agents/:id/eval/batches?from&to       → date-filtered batches
 *   GET    /eval/compare?base&head                → run-vs-run deltas + prompts
 *   POST   /agents/:id/eval/promote { version }   → promote a version's config
 *
 * Schema-first: every param/body/query is a Zod schema, so invalid input becomes
 * a 422 before the handler runs. Responses are exact DTOs (`@devdigest/shared`).
 */

const ListCasesQuery = z.object({
  owner_kind: EvalOwnerKind,
  owner_id: z.string().uuid(),
});

const RunTimesBody = z
  .object({ times: z.number().int().positive().max(50).default(DEFAULT_RUN_TIMES) })
  .optional();

const RunAllBody = z.object({ version: z.number().int().positive().optional() }).optional();

const RunsQuery = z.object({
  limit: z.coerce.number().int().positive().max(100).default(DEFAULT_RUNS_LIMIT),
});

const RangeQuery = z.object({
  from: z.string().optional(),
  to: z.string().optional(),
});

const CompareQuery = z.object({
  base: z.string().uuid(),
  head: z.string().uuid(),
});

const PromoteBody = z.object({ version: z.number().int().positive() });

export default async function evalRoutes(appBase: FastifyInstance) {
  const app = appBase.withTypeProvider<ZodTypeProvider>();
  const service = new EvalService(app.container);

  // ---- Cases -------------------------------------------------------------

  app.get('/eval/cases', { schema: { querystring: ListCasesQuery } }, async (req) => {
    const { workspaceId } = await getContext(app.container, req);
    return service.listCases(workspaceId, req.query.owner_kind, req.query.owner_id);
  });

  app.post('/eval/cases', { schema: { body: EvalCaseInput } }, async (req, reply) => {
    const { workspaceId } = await getContext(app.container, req);
    const created = await service.createCase(workspaceId, req.body);
    reply.status(201);
    return created;
  });

  app.get('/eval/cases/:id', { schema: { params: IdParams } }, async (req) => {
    const { workspaceId } = await getContext(app.container, req);
    const found = await service.getCase(workspaceId, req.params.id);
    if (!found) throw new NotFoundError('Eval case not found');
    return found;
  });

  app.put(
    '/eval/cases/:id',
    { schema: { params: IdParams, body: EvalCaseInput } },
    async (req) => {
      const { workspaceId } = await getContext(app.container, req);
      const updated = await service.updateCase(workspaceId, req.params.id, req.body);
      if (!updated) throw new NotFoundError('Eval case not found');
      return updated;
    },
  );

  app.delete('/eval/cases/:id', { schema: { params: IdParams } }, async (req) => {
    const { workspaceId } = await getContext(app.container, req);
    const ok = await service.deleteCase(workspaceId, req.params.id);
    if (!ok) throw new NotFoundError('Eval case not found');
    return { deleted: req.params.id };
  });

  // ---- Ad-hoc run + runs list --------------------------------------------

  app.post(
    '/eval/cases/:id/run',
    { schema: { params: IdParams, body: RunTimesBody } },
    async (req) => {
      const { workspaceId } = await getContext(app.container, req);
      const times = req.body?.times ?? DEFAULT_RUN_TIMES;
      return service.runCaseTimes(workspaceId, req.params.id, times);
    },
  );

  app.get(
    '/eval/cases/:id/runs',
    { schema: { params: IdParams, querystring: RunsQuery } },
    async (req) => {
      const { workspaceId } = await getContext(app.container, req);
      return service.caseRuns(workspaceId, req.params.id, req.query.limit);
    },
  );

  // ---- Run-all (per owner + whole dashboard) -----------------------------

  app.post(
    '/agents/:id/eval/run-all',
    { schema: { params: IdParams, body: RunAllBody } },
    async (req) => {
      const { workspaceId } = await getContext(app.container, req);
      return service.runAll(workspaceId, 'agent', req.params.id, req.body?.version);
    },
  );

  app.post(
    '/skills/:id/eval/run-all',
    { schema: { params: IdParams, body: RunAllBody } },
    async (req) => {
      const { workspaceId } = await getContext(app.container, req);
      return service.runAll(workspaceId, 'skill', req.params.id, req.body?.version);
    },
  );

  app.post('/eval/dashboard/run-all', async (req) => {
    const { workspaceId } = await getContext(app.container, req);
    return service.dashboardRunAll(workspaceId);
  });

  // ---- Dashboards + batches ----------------------------------------------

  app.get('/eval/dashboard', async (req) => {
    const { workspaceId } = await getContext(app.container, req);
    return service.agentDashboard(workspaceId);
  });

  app.get(
    '/agents/:id/eval/dashboard',
    { schema: { params: IdParams, querystring: RangeQuery } },
    async (req) => {
      const { workspaceId } = await getContext(app.container, req);
      return service.ownerDashboard(workspaceId, 'agent', req.params.id, req.query.from, req.query.to);
    },
  );

  app.get(
    '/skills/:id/eval/dashboard',
    { schema: { params: IdParams, querystring: RangeQuery } },
    async (req) => {
      const { workspaceId } = await getContext(app.container, req);
      return service.ownerDashboard(workspaceId, 'skill', req.params.id, req.query.from, req.query.to);
    },
  );

  app.get(
    '/agents/:id/eval/batches',
    { schema: { params: IdParams, querystring: RangeQuery } },
    async (req) => {
      const { workspaceId } = await getContext(app.container, req);
      return service.ownerBatches(workspaceId, 'agent', req.params.id, req.query.from, req.query.to);
    },
  );

  // ---- Compare + Promote -------------------------------------------------

  app.get('/eval/compare', { schema: { querystring: CompareQuery } }, async (req) => {
    const { workspaceId } = await getContext(app.container, req);
    return service.compare(workspaceId, req.query.base, req.query.head);
  });

  app.post(
    '/agents/:id/eval/promote',
    { schema: { params: IdParams, body: PromoteBody } },
    async (req) => {
      const { workspaceId } = await getContext(app.container, req);
      const agent = await service.promote(workspaceId, req.params.id, req.body.version);
      if (!agent) throw new NotFoundError('Agent not found');
      return agent;
    },
  );
}
