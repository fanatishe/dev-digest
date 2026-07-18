import type { FastifyInstance } from 'fastify';
import { ZodTypeProvider } from 'fastify-type-provider-zod';
import { RunParams, RunListQuery, RunInput } from '@devdigest/shared';
import { RunService } from './service.js';

export default async function runsRoutes(appBase: FastifyInstance) {
  const app = appBase.withTypeProvider<ZodTypeProvider>();
  const service = new RunService(app.container);

  app.get('/runs', { schema: { querystring: RunListQuery } }, async (req) => {
    return service.list(req.query.workspaceId);
  });

  app.get('/runs/:id', { schema: { params: RunParams } }, async (req) => {
    return service.getRunView(req.params.id);
  });

  app.post('/runs', { schema: { body: RunInput } }, async (req, reply) => {
    const run = await service.enqueue(req.body);
    reply.status(202);
    return run;
  });
}
