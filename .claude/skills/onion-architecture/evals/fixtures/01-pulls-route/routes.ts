import type { FastifyInstance } from 'fastify';
import { ZodTypeProvider } from 'fastify-type-provider-zod';
import { and, eq, desc } from 'drizzle-orm';
import { db } from '../../db/client.js';
import { pullRequests } from '../../db/schema.js';
import { PullListQuery, PullInput } from '@devdigest/shared';

export default async function pullsRoutes(appBase: FastifyInstance) {
  const app = appBase.withTypeProvider<ZodTypeProvider>();

  app.get('/pulls', { schema: { querystring: PullListQuery } }, async (req) => {
    const rows = await db
      .select()
      .from(pullRequests)
      .where(eq(pullRequests.workspaceId, req.query.workspaceId))
      .orderBy(desc(pullRequests.updatedAt));

    return rows.map((r) => ({
      id: r.id,
      number: r.number,
      title: r.title,
      url: r.htmlUrl,
      state: r.state,
    }));
  });

  app.post('/pulls', { schema: { body: PullInput } }, async (req, reply) => {
    const existing = await db
      .select()
      .from(pullRequests)
      .where(
        and(
          eq(pullRequests.workspaceId, req.body.workspaceId),
          eq(pullRequests.number, req.body.number),
        ),
      );

    if (existing.length > 0) {
      reply.status(200);
      return existing[0];
    }

    const [row] = await db.insert(pullRequests).values(req.body).returning();
    reply.status(201);
    return row;
  });
}
