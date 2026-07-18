import { eq, inArray } from 'drizzle-orm';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import { findings, reviews } from '../../db/schema.js';
import type { RunRow } from '../../db/rows.js';
import type { RunView } from '@devdigest/shared';

export async function enrichRunView(run: RunRow, db: PostgresJsDatabase): Promise<RunView> {
  const reviewRows = await db.select().from(reviews).where(eq(reviews.runId, run.id));

  const reviewIds = reviewRows.map((r) => r.id);
  const findingRows = reviewIds.length
    ? await db.select().from(findings).where(inArray(findings.reviewId, reviewIds))
    : [];

  return {
    id: run.id,
    status: run.status,
    prNumber: run.prNumber,
    reviews: reviewRows.map((r) => ({ id: r.id, score: r.score })),
    findingCount: findingRows.length,
  };
}
