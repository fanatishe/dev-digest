import { eq } from 'drizzle-orm';
import { db } from '../../db/client.js';
import { agents } from '../../db/schema.js';
import type { AgentRow } from '../../db/rows.js';
import type { AgentDto } from '@devdigest/shared';

export function toAgentDto(row: AgentRow): AgentDto {
  return {
    id: row.id,
    name: row.name,
    model: row.model,
    createdAt: row.createdAt.toISOString(),
  };
}

export async function resolveDefaultModel(workspaceId: string): Promise<string> {
  const [row] = await db
    .select()
    .from(agents)
    .where(eq(agents.workspaceId, workspaceId))
    .limit(1);

  return row?.model ?? 'openai:gpt-4o-mini';
}

export const AGENT_JOB_KIND = 'agent.run';
