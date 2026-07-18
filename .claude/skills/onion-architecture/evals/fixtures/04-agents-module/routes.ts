import type { FastifyInstance } from 'fastify';
import { ZodTypeProvider } from 'fastify-type-provider-zod';
import { AgentInput, AgentParams } from '@devdigest/shared';
import { AgentService } from './service.js';

export default async function agentsRoutes(appBase: FastifyInstance) {
  const app = appBase.withTypeProvider<ZodTypeProvider>();
  const service = new AgentService(app.container);

  app.post('/agents', { schema: { body: AgentInput } }, async (req, reply) => {
    const agent = await service.create(req.body);
    reply.status(201);
    return agent;
  });

  app.get('/agents/:id', { schema: { params: AgentParams } }, async (req) => {
    return service.get(req.params.id);
  });

  app.get('/agents', async (req) => {
    return service.list(req.query as { workspaceId: string });
  });
}
