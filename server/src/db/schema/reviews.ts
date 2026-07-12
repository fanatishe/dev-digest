import { sql } from 'drizzle-orm';
import { pgTable, uuid, text, integer, jsonb, timestamp, doublePrecision } from 'drizzle-orm/pg-core';
import { now } from './_shared';
import { workspaces } from './core';
import { pullRequests } from './pulls';

// ============================================================ Review & findings

export const reviews = pgTable('reviews', {
  id: uuid('id').primaryKey().defaultRandom(),
  workspaceId: uuid('workspace_id')
    .notNull()
    .references(() => workspaces.id, { onDelete: 'cascade' }),
  prId: uuid('pr_id')
    .notNull()
    .references(() => pullRequests.id, { onDelete: 'cascade' }),
  agentId: uuid('agent_id'),
  /** The agent_run that produced this review (links the timeline run ↔ review). */
  runId: uuid('run_id'),
  kind: text('kind', { enum: ['summary', 'review'] }).notNull(),
  verdict: text('verdict'),
  summary: text('summary'),
  score: integer('score'),
  model: text('model'),
  createdAt: now(),
});

export const findings = pgTable('findings', {
  id: uuid('id').primaryKey().defaultRandom(),
  reviewId: uuid('review_id')
    .notNull()
    .references(() => reviews.id, { onDelete: 'cascade' }),
  file: text('file').notNull(),
  startLine: integer('start_line').notNull(),
  endLine: integer('end_line').notNull(),
  severity: text('severity').notNull(),
  category: text('category').notNull(),
  title: text('title').notNull(),
  rationale: text('rationale').notNull(),
  suggestion: text('suggestion'),
  confidence: doublePrecision('confidence').notNull(),
  kind: text('kind').notNull().default('finding'),
  trifectaComponents: jsonb('trifecta_components').$type<string[]>(),
  acceptedAt: timestamp('accepted_at', { withTimezone: true }),
  dismissedAt: timestamp('dismissed_at', { withTimezone: true }),
});

/**
 * The Intent Layer: what this PR was TRYING to do, derived by one cheap model
 * call over PR metadata + hunk HEADERS only (never the diff bodies).
 *
 * `tokensFull` vs `tokensHeaders` is the receipt for that trick — what the full
 * diff would have cost vs. what we actually sent. `tokens_saved` is NOT stored:
 * it is the difference, derived on read.
 *
 * `headSha` pins the intent to the commit it was derived from, so a PR whose
 * head has since moved can be shown as stale (same idea as
 * `pull_requests.lastReviewedSha`).
 */
export const prIntent = pgTable('pr_intent', {
  prId: uuid('pr_id')
    .primaryKey()
    .references(() => pullRequests.id, { onDelete: 'cascade' }),
  intent: text('intent').notNull(),
  inScope: jsonb('in_scope').$type<string[]>().notNull().default(sql`'[]'::jsonb`),
  outOfScope: jsonb('out_of_scope').$type<string[]>().notNull().default(sql`'[]'::jsonb`),
  /** Short chip labels ("Auth surface touched") — not the richer `Risk`: the
      classifier never sees hunk bodies, so it cannot ground file refs. */
  riskAreas: jsonb('risk_areas').$type<string[]>().notNull().default(sql`'[]'::jsonb`),
  /** Which rungs of the source ladder fired — makes degradation visible. */
  derivedFrom: jsonb('derived_from').$type<string[]>().notNull().default(sql`'[]'::jsonb`),
  headSha: text('head_sha'),
  provider: text('provider'),
  model: text('model'),
  tokensFull: integer('tokens_full'),
  tokensHeaders: integer('tokens_headers'),
  /** Not the shared `now()` helper: that one is named `created_at`, and this row
      is UPSERTed on every recompute — it records the latest scan, not a birth. */
  computedAt: timestamp('computed_at', { withTimezone: true }).defaultNow().notNull(),
});

export const prBrief = pgTable('pr_brief', {
  prId: uuid('pr_id')
    .primaryKey()
    .references(() => pullRequests.id, { onDelete: 'cascade' }),
  json: jsonb('json').notNull(),
});
