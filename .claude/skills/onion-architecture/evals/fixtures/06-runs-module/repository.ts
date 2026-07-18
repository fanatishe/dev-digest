import { eq } from 'drizzle-orm';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import { runs } from '../../db/schema.js';
import type { RunRow } from '../../db/rows.js';

export class RunRepository {
  constructor(private db: PostgresJsDatabase) {}

  listByWorkspace(workspaceId: string): Promise<RunRow[]> {
    return this.db.select().from(runs).where(eq(runs.workspaceId, workspaceId));
  }

  async findById(id: string): Promise<RunRow | undefined> {
    const [row] = await this.db.select().from(runs).where(eq(runs.id, id));
    return row;
  }

  async create(input: { workspaceId: string; repoId: string; prNumber: number }): Promise<RunRow> {
    const [row] = await this.db
      .insert(runs)
      .values({ ...input, status: 'queued' })
      .returning();
    return row;
  }
}
