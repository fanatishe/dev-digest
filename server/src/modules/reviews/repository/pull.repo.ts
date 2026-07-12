import { and, asc, eq } from 'drizzle-orm';
import type { Db } from '../../../db/client.js';
import * as t from '../../../db/schema.js';
import type { Intent } from '@devdigest/shared';
import type { PrIntentRow, PullRow } from '../../../db/rows.js';

// ---- PR lookup (workspace-scoped) -----------------------------------------

export async function getPull(
  db: Db,
  workspaceId: string,
  prId: string,
): Promise<PullRow | undefined> {
  const [row] = await db
    .select()
    .from(t.pullRequests)
    .where(and(eq(t.pullRequests.workspaceId, workspaceId), eq(t.pullRequests.id, prId)));
  return row;
}

export async function getRepo(
  db: Db,
  repoId: string,
): Promise<typeof t.repos.$inferSelect | undefined> {
  const [row] = await db.select().from(t.repos).where(eq(t.repos.id, repoId));
  return row;
}

export async function getPrFiles(
  db: Db,
  prId: string,
): Promise<(typeof t.prFiles.$inferSelect)[]> {
  return db.select().from(t.prFiles).where(eq(t.prFiles.prId, prId));
}

/**
 * Record the commit a review just ran against, so the PR list can derive
 * `reviewed` vs `needs_review` (head moved since the last review) vs `stale`.
 */
export async function markReviewed(db: Db, prId: string, sha: string): Promise<void> {
  await db
    .update(t.pullRequests)
    .set({ lastReviewedSha: sha })
    .where(eq(t.pullRequests.id, prId));
}

/** Commit messages for a PR, oldest first — rung 6 of the intent source ladder.
 *  Free (already imported), and the strongest implicit signal on a bodyless PR. */
export async function getPrCommits(
  db: Db,
  prId: string,
): Promise<(typeof t.prCommits.$inferSelect)[]> {
  return db
    .select()
    .from(t.prCommits)
    .where(eq(t.prCommits.prId, prId))
    .orderBy(asc(t.prCommits.committedAt));
}

// ---- intent ---------------------------------------------------------------

/**
 * Provenance stamped onto an intent alongside the model's own output: the head
 * it was derived from (drives `is_stale`), which model derived it, and the token
 * receipt for the headers-only trick. `tokens_saved` is deliberately NOT stored
 * — it is `tokensFull - tokensHeaders`, derived on read.
 */
export interface IntentProvenance {
  headSha: string | null;
  provider: string | null;
  model: string | null;
  tokensFull: number | null;
  tokensHeaders: number | null;
}

export async function upsertIntent(
  db: Db,
  prId: string,
  intent: Intent,
  provenance: IntentProvenance,
): Promise<PrIntentRow> {
  // `set` deliberately excludes `prId`: it is the conflict target (the PK), so
  // re-assigning it on update is a no-op write of the row's own identity.
  const values = {
    intent: intent.intent,
    inScope: intent.in_scope,
    outOfScope: intent.out_of_scope,
    riskAreas: intent.risk_areas ?? [],
    derivedFrom: intent.derived_from ?? [],
    headSha: provenance.headSha,
    provider: provenance.provider,
    model: provenance.model,
    tokensFull: provenance.tokensFull,
    tokensHeaders: provenance.tokensHeaders,
    // One row per PR, UPSERTed on every recompute: `computed_at` records the
    // LATEST scan, so it must be bumped explicitly (the column default only
    // applies on insert).
    computedAt: new Date(),
  };
  const [row] = await db
    .insert(t.prIntent)
    .values({ prId, ...values })
    .onConflictDoUpdate({ target: t.prIntent.prId, set: values })
    .returning();
  return row!;
}

/** The raw row (provenance included) — the service maps it to `PrIntentRecord`. */
export async function getIntentRow(db: Db, prId: string): Promise<PrIntentRow | undefined> {
  const [row] = await db.select().from(t.prIntent).where(eq(t.prIntent.prId, prId));
  return row;
}

export async function getIntent(db: Db, prId: string): Promise<Intent | undefined> {
  const row = await getIntentRow(db, prId);
  if (!row) return undefined;
  return {
    intent: row.intent,
    in_scope: row.inScope,
    out_of_scope: row.outOfScope,
    risk_areas: row.riskAreas,
    derived_from: row.derivedFrom,
  };
}
