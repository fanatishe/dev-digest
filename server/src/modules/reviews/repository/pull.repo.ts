import { and, asc, eq, inArray } from 'drizzle-orm';
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

/**
 * The PR row by id ALONE — no workspace filter, because there is nobody to scope
 * against yet. Its only caller is the intent job handler, whose payload carries a
 * `prId` minted by our own PR-list handler and nothing else. The row itself is the
 * source of the workspace: the handler reads `workspaceId` off it and then re-reads
 * the PR through the workspace-scoped `getPull`, so no caller can ever widen its
 * own scope by handing us an id.
 *
 * 🔴 This is deliberately NOT on `ReviewRepository`, and must not be put back there.
 * `container.reviewRepo` is reachable from EVERY route, so a workspace-free read on
 * that facade sits three lines away from a `req.params.id` in any handler that ever
 * holds it — and a comment is not a constraint. `IntentService` lives inside
 * `modules/reviews`, so it imports this module function directly (no boundary is
 * crossed) and the unscoped read stays unreachable from the HTTP ring. An HTTP
 * handler needing a PR must use `getPull(workspaceId, prId)`.
 */
export async function getPullById(db: Db, prId: string): Promise<PullRow | undefined> {
  const [row] = await db.select().from(t.pullRequests).where(eq(t.pullRequests.id, prId));
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
  /**
   * What the PROVIDER actually billed for the classify call — distinct from
   * `tokensFull`/`tokensHeaders`, which are OUR tokenizer's count of two
   * renderings of the diff. Intent is now computed automatically by a background
   * job, so spend nobody clicked for must still leave a receipt.
   *
   * Nullable end to end: `costUsd` is null whenever the provider reported no
   * usage, and rows written before these columns existed have no receipt at all.
   */
  tokensIn: number | null;
  tokensOut: number | null;
  costUsd: number | null;
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
    tokensIn: provenance.tokensIn,
    tokensOut: provenance.tokensOut,
    costUsd: provenance.costUsd,
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

/**
 * Which of these PRs already have an intent. `pr_intent` is OWNED by this module,
 * so the PR-list read (`modules/pulls`) asks for this through the
 * `container.reviewRepo` facade instead of querying `pr_intent` itself — a table
 * has exactly one owning module.
 *
 * One `IN` query for the whole page, riding the PK's B-tree (`pr_intent.pr_id` is
 * the primary key). `inArray` with an empty list is invalid SQL, hence the guard.
 */
export async function prIdsWithIntent(db: Db, prIds: string[]): Promise<string[]> {
  if (prIds.length === 0) return [];
  const rows = await db
    .select({ prId: t.prIntent.prId })
    .from(t.prIntent)
    .where(inArray(t.prIntent.prId, prIds));
  return rows.map((r) => r.prId);
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
