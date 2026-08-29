import { pgTable, uuid, text, integer, boolean, jsonb, timestamp, doublePrecision, index } from 'drizzle-orm/pg-core';
import { workspaces } from './core';
import { pullRequests } from './pulls';

// ============================================================ Eval / Conformance / Compose

export const evalCases = pgTable('eval_cases', {
  id: uuid('id').primaryKey().defaultRandom(),
  workspaceId: uuid('workspace_id')
    .notNull()
    .references(() => workspaces.id, { onDelete: 'cascade' }),
  ownerKind: text('owner_kind', { enum: ['skill', 'agent'] }).notNull(),
  ownerId: uuid('owner_id').notNull(),
  name: text('name').notNull(),
  inputDiff: text('input_diff'),
  inputFiles: jsonb('input_files'),
  inputMeta: jsonb('input_meta'),
  expectedOutput: jsonb('expected_output'),
  notes: text('notes'),
});

export const evalRuns = pgTable(
  'eval_runs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    caseId: uuid('case_id')
      .notNull()
      .references(() => evalCases.id, { onDelete: 'cascade' }),
    ranAt: timestamp('ran_at', { withTimezone: true }).defaultNow().notNull(),
    actualOutput: jsonb('actual_output'),
    pass: boolean('pass'),
    recall: doublePrecision('recall'),
    precision: doublePrecision('precision'),
    citationAccuracy: doublePrecision('citation_accuracy'),
    durationMs: integer('duration_ms'),
    costUsd: doublePrecision('cost_usd'),
    // Set when this run belongs to a run-all batch; null for ad-hoc "Run N×" rows.
    batchId: uuid('batch_id').references(() => evalBatches.id),
    // The pinned agent/skill version this run was measured on (nullable for legacy rows).
    agentVersion: integer('agent_version'),
  },
  (t) => ({
    // Reproducibility window read: WHERE case_id=? AND agent_version=? ORDER BY ran_at DESC LIMIT N.
    caseVersionRanIdx: index('eval_runs_case_version_ran_idx').on(
      t.caseId,
      t.agentVersion,
      t.ranAt.desc(),
    ),
    // FK index (Postgres does not auto-index FKs): "runs in this batch" reads + cascade paths.
    batchIdx: index('eval_runs_batch_idx').on(t.batchId),
  }),
);

// One row per run-all over an owner's cases — a single trend point on the dashboard.
export const evalBatches = pgTable(
  'eval_batches',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    ownerKind: text('owner_kind', { enum: ['skill', 'agent'] }).notNull(),
    ownerId: uuid('owner_id').notNull(),
    agentVersion: integer('agent_version'),
    ranAt: timestamp('ran_at', { withTimezone: true }).defaultNow().notNull(),
    recall: doublePrecision('recall'),
    precision: doublePrecision('precision'),
    citationAccuracy: doublePrecision('citation_accuracy'),
    passRate: doublePrecision('pass_rate'),
    tracesPassed: integer('traces_passed'),
    tracesTotal: integer('traces_total'),
    casesTotal: integer('cases_total'),
    costUsd: doublePrecision('cost_usd'),
    durationMs: integer('duration_ms'),
  },
  (t) => ({
    // Date-range / trend reads for a given owner.
    ownerRanIdx: index('eval_batches_owner_ran_idx').on(t.ownerKind, t.ownerId, t.ranAt),
    // FK index (Postgres does not auto-index FKs): workspace-scoped reads + cascade paths.
    workspaceIdx: index('eval_batches_workspace_idx').on(t.workspaceId),
  }),
);

export const conformanceChecks = pgTable('conformance_checks', {
  id: uuid('id').primaryKey().defaultRandom(),
  prId: uuid('pr_id')
    .notNull()
    .references(() => pullRequests.id, { onDelete: 'cascade' }),
  specId: text('spec_id').notNull(),
  completenessPct: doublePrecision('completeness_pct'),
  items: jsonb('items'),
});

export const composedReviews = pgTable('composed_reviews', {
  id: uuid('id').primaryKey().defaultRandom(),
  prId: uuid('pr_id')
    .notNull()
    .references(() => pullRequests.id, { onDelete: 'cascade' }),
  body: text('body').notNull(),
  verdict: text('verdict'),
  postedAt: timestamp('posted_at', { withTimezone: true }),
  githubReviewId: text('github_review_id'),
});
