import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { and, desc, eq, inArray, isNull, sql } from 'drizzle-orm';
import type { PrMeta, PrDetail, GitHubClient, PrReviewComment, FindingsCounts, FindingPreview, SmartDiff, BlastRadius, PrHistory, RepoRef } from '@devdigest/shared';
import { PrCommentInput, SmartDiffResponse, BlastRadiusResponse, PrHistoryResponse } from '@devdigest/shared';
import * as t from '../../db/schema.js';
import { getContext } from '../_shared/context.js';
import { IdParams } from '../_shared/schemas.js';
import { AppError, NotFoundError } from '../../platform/errors.js';
import { deriveReviewStatus } from './status.js';
import { buildSmartDiff } from './smart-diff.js';
import { buildBlastRadius } from './blast.js';
import { buildPrHistory, type HistoryInputCommit } from './history.js';
import { HISTORY_MAX_COMMITS_PER_FILE, HISTORY_MAX_FILES } from './blast.constants.js';
import { INTENT_ENQUEUE_LIMIT, IntentJobPayload } from './constants.js';
// Constant-only cross-module import — the established precedent
// (`repos/service.ts` imports INDEX_JOB_KIND from `repo-intel/constants.js`).
// A job KIND is a domain-ring literal; nothing else from `modules/reviews/` is
// imported here, and NO table owned by that module is queried from this file:
// `pr_intent` is reached ONLY through the `container.reviewRepo` facade.
import { INTENT_JOB_KIND } from '../reviews/constants.js';

/**
 * F1 — pulls module. PR import via Octokit (list + per-PR detail).
 *   GET /repos/:id/pulls → list PRs for a repo (open + recently merged/closed,
 *                          synced from GitHub, persisted). `status` is GitHub's
 *                          merge state (open/merged/closed).
 *   GET /pulls/:id       → full PR detail (diff/files, commits, body, linked issue)
 *
 * Import is idempotent (unique repo_id+number). Review trigger is MANUAL
 * and owned by A2 — this module only imports/reads.
 */
export default async function pullsRoutes(appBase: FastifyInstance) {
  const app = appBase.withTypeProvider<ZodTypeProvider>();
  const { container } = app;

  app.get('/repos/:id/pulls', { schema: { params: IdParams } }, async (req): Promise<PrMeta[]> => {
    const { workspaceId } = await getContext(container, req);
    const [repo] = await container.db
      .select()
      .from(t.repos)
      .where(and(eq(t.repos.workspaceId, workspaceId), eq(t.repos.id, req.params.id)));
    if (!repo) throw new NotFoundError('Repo not found');

    let gh: GitHubClient | null = null;
    try {
      gh = await container.github();
    } catch (err) {
      app.log.warn({ err }, 'GitHub client unavailable (no token / offline); serving persisted PRs');
    }

    // Local-first: sync from GitHub when a token is configured, but never
    // fail the read — already-imported/seeded PRs stay viewable offline.
    if (gh) {
      try {
        const pulls = await gh.listPullRequests({ owner: repo.owner, name: repo.name });
        for (const pr of pulls) {
          await container.db
            .insert(t.pullRequests)
            .values({
              workspaceId,
              repoId: repo.id,
              number: pr.number,
              title: pr.title,
              author: pr.author,
              branch: pr.branch,
              base: pr.base,
              headSha: pr.head_sha,
              additions: pr.additions,
              deletions: pr.deletions,
              filesCount: pr.files_count,
              status: pr.status,
              openedAt: pr.opened_at ? new Date(pr.opened_at) : null,
              updatedAt: pr.updated_at ? new Date(pr.updated_at) : null,
            })
            .onConflictDoUpdate({
              target: [t.pullRequests.repoId, t.pullRequests.number],
              set: {
                title: pr.title,
                headSha: pr.head_sha,
                status: pr.status,
                updatedAt: pr.updated_at ? new Date(pr.updated_at) : null,
              },
            });
        }
      } catch (err) {
        app.log.warn({ err }, 'GitHub PR sync skipped (no token / offline); serving persisted PRs');
      }
    }

    const rows = await container.db
      .select()
      .from(t.pullRequests)
      .where(eq(t.pullRequests.repoId, repo.id));

    // Diff stats aren't on GitHub's PR-list payload, so freshly-imported PRs
    // land with zeroed size/diff. Backfill them once from the detail endpoint
    // so the list shows real S/M/L + ± counts. Capped per request (each backfill
    // is a detail fetch) — the periodic refetch chips away at any remainder.
    const BACKFILL_LIMIT = 10;
    if (gh) {
      const needStats = rows
        .filter((r) => r.additions === 0 && r.deletions === 0 && r.filesCount === 0)
        .slice(0, BACKFILL_LIMIT);
      for (const r of needStats) {
        try {
          const detail = await gh.getPullRequest({ owner: repo.owner, name: repo.name }, r.number);
          await container.db
            .update(t.pullRequests)
            .set({
              additions: detail.additions,
              deletions: detail.deletions,
              filesCount: detail.files_count,
            })
            .where(eq(t.pullRequests.id, r.id));
          r.additions = detail.additions;
          r.deletions = detail.deletions;
          r.filesCount = detail.files_count;
        } catch (err) {
          app.log.warn({ err, number: r.number }, 'PR diff-stat backfill skipped');
        }
      }
    }

    // Latest-review SCORE per PR for the list's score ring. Computed on read
    // from reviews (no FK denorm); the list is small, so one IN-query + JS
    // grouping is cheap. The per-severity FINDINGS breakdown + a capped preview
    // (for the list's hover popup) are rolled up the same way just below —
    // aggregated across ALL of a PR's reviews, excluding dismissed findings.
    const prIds = rows.map((r) => r.id);
    const latestReviewByPr = new Map<string, { score: number | null }>();
    // Total run cost per PR (sum across ALL runs; null when no run reported usage).
    // One grouped query, same IN-list as the score rollup.
    const costByPr = new Map<string, number>();
    // Per-severity finding tallies + a small preview slice per PR.
    const findingsByPr = new Map<string, FindingsCounts>();
    const previewByPr = new Map<string, FindingPreview[]>();
    if (prIds.length > 0) {
      const reviewRows = await container.db
        .select({ prId: t.reviews.prId, score: t.reviews.score })
        .from(t.reviews)
        .where(and(inArray(t.reviews.prId, prIds), eq(t.reviews.kind, 'review')))
        .orderBy(desc(t.reviews.createdAt));
      // Rows are newest-first → first seen per PR is the latest review.
      for (const rv of reviewRows) {
        if (!latestReviewByPr.has(rv.prId)) latestReviewByPr.set(rv.prId, { score: rv.score });
      }

      const costRows = await container.db
        .select({
          prId: t.agentRuns.prId,
          total: sql<number>`sum(${t.agentRuns.costUsd})`.mapWith(Number),
        })
        .from(t.agentRuns)
        .where(inArray(t.agentRuns.prId, prIds))
        .groupBy(t.agentRuns.prId);
      // SUM is null when a PR's runs all have null cost → skip (stays absent → "—").
      for (const c of costRows) {
        if (c.prId != null && c.total != null) costByPr.set(c.prId, c.total);
      }

      // FINDINGS: every non-dismissed finding across the PRs' reviews, joined back
      // to its PR. Counted per severity, and kept as a capped preview for the popup.
      const SEV_RANK: Record<string, number> = { CRITICAL: 0, WARNING: 1, SUGGESTION: 2 };
      const PREVIEW_CAP = 6;
      const RATIONALE_MAX = 140;
      const findingRows = await container.db
        .select({
          prId: t.reviews.prId,
          id: t.findings.id,
          severity: t.findings.severity,
          title: t.findings.title,
          file: t.findings.file,
          startLine: t.findings.startLine,
          confidence: t.findings.confidence,
          rationale: t.findings.rationale,
        })
        .from(t.findings)
        .innerJoin(t.reviews, eq(t.findings.reviewId, t.reviews.id))
        .where(and(inArray(t.reviews.prId, prIds), isNull(t.findings.dismissedAt)));

      const rawByPr = new Map<string, typeof findingRows>();
      for (const f of findingRows) {
        const counts = findingsByPr.get(f.prId) ?? { CRITICAL: 0, WARNING: 0, SUGGESTION: 0 };
        if (f.severity === 'CRITICAL' || f.severity === 'WARNING' || f.severity === 'SUGGESTION') {
          counts[f.severity] += 1;
        }
        findingsByPr.set(f.prId, counts);
        const bucket = rawByPr.get(f.prId) ?? [];
        bucket.push(f);
        rawByPr.set(f.prId, bucket);
      }
      for (const [prId, list] of rawByPr) {
        const preview = list
          .slice()
          .sort(
            (a, b) =>
              (SEV_RANK[a.severity] ?? 9) - (SEV_RANK[b.severity] ?? 9) ||
              b.confidence - a.confidence,
          )
          .slice(0, PREVIEW_CAP)
          .map((f): FindingPreview => {
            // `rationale` is NOT NULL in the schema, but guard defensively so a
            // stray null can never 500 the whole PR-list endpoint.
            const rationale = f.rationale ?? '';
            return {
              id: f.id,
              severity: f.severity as FindingPreview['severity'],
              title: f.title,
              file: f.file,
              start_line: f.startLine,
              confidence: f.confidence,
              rationale:
                rationale.length > RATIONALE_MAX
                  ? `${rationale.slice(0, RATIONALE_MAX - 1).trimEnd()}…`
                  : rationale,
            };
          });
        previewByPr.set(prId, preview);
      }

      // ---- Intent auto-fill (L03) ----------------------------------------
      // Smart Diff's context header and the reviewer's intent injection are
      // both worthless on a PR nobody ever clicked the recompute button on, so
      // fill MISSING intents in the background from this read. Only missing
      // ones: a STALE intent is still never silently recomputed (that stays a
      // manual, human-clicked action).
      //
      // 🔴 DOUBLE-SPEND. Every enqueued job is a billable model call, and this
      // handler is polled (TanStack Query refetches on window focus). "Enqueue
      // when there is no `pr_intent` row" is check-then-act: no row exists until
      // the job LANDS, so a plain missing-row guard re-enqueues the same PR on
      // every read in between — tab away, tab back, pay again. `upsertIntent`'s
      // ON CONFLICT makes the WRITE safe; it does nothing for the SPEND.
      // So we skip a PR that either
      //   (a) already HAS an intent  — asked through the `container.reviewRepo`
      //       facade: `pr_intent` is owned by `modules/reviews`, and a table has
      //       exactly one owning module (one IN-query on the PK's B-tree), or
      //   (b) already has an IN-FLIGHT (queued|running) intent job — asked of the
      //       JobRunner, which owns the platform-level `jobs` table.
      // Residual window: two SIMULTANEOUS requests can still both pass the check
      // before either has inserted its `jobs` row. Closing that fully needs a DB
      // uniqueness constraint (partial unique index on the in-flight payload),
      // which is a schema change and out of scope here. What this does kill is
      // the UNBOUNDED re-enqueue-on-every-poll loop, which was the real bill.
      const [prIdsWithIntent, inFlight] = await Promise.all([
        container.reviewRepo.prIdsWithIntent(prIds),
        container.jobs.pendingPayloads(workspaceId, INTENT_JOB_KIND),
      ]);
      const skipIntent = new Set(prIdsWithIntent);
      for (const payload of inFlight) {
        // `jobs.payload` is free-form jsonb → parse, never cast.
        const parsed = IntentJobPayload.safeParse(payload);
        if (parsed.success) skipIntent.add(parsed.data.prId);
      }
      // Capped per request, mirroring BACKFILL_LIMIT above: this spends money
      // without a human in the loop, so the cap is load-bearing.
      const missingIntent = prIds
        .filter((id) => !skipIntent.has(id))
        .slice(0, INTENT_ENQUEUE_LIMIT);
      let intentJobsEnqueued = 0;
      for (const prId of missingIntent) {
        try {
          await container.jobs.enqueue(workspaceId, INTENT_JOB_KIND, { prId });
          intentJobsEnqueued += 1;
        } catch (err) {
          // `jobs.enqueue` THROWS when no handler is registered for the kind
          // (platform/jobs.ts). A PR-list READ must never 500 because a
          // background intent job could not be queued — log and carry on; the
          // intent shows up on a later visit. Same shape as repos/service.ts.
          app.log.warn({ err, prId }, 'Intent auto-fill enqueue skipped');
        }
      }
      if (intentJobsEnqueued > 0) {
        // The cost receipt persisted per intent (`pr_intent.cost_usd`) is only
        // reconcilable against a count of what we actually PAID to start, so the
        // number enqueued — not the number considered — is what gets logged.
        app.log.info(
          { repoId: repo.id, enqueued: intentJobsEnqueued, candidates: missingIntent.length },
          'Intent auto-fill: enqueued background intent job(s)',
        );
      }
    }

    const now = Date.now();
    return rows.map((r) => {
      const review = latestReviewByPr.get(r.id);
      return {
        id: r.id,
        number: r.number,
        title: r.title,
        author: r.author,
        branch: r.branch,
        base: r.base,
        head_sha: r.headSha,
        additions: r.additions,
        deletions: r.deletions,
        files_count: r.filesCount,
        status: deriveReviewStatus({
          ghStatus: r.status,
          lastReviewedSha: r.lastReviewedSha,
          headSha: r.headSha,
          updatedAt: r.updatedAt,
          now,
        }),
        opened_at: r.openedAt?.toISOString() ?? null,
        updated_at: r.updatedAt?.toISOString() ?? null,
        score: review ? review.score : null,
        cost_usd: costByPr.get(r.id) ?? null,
        findings: findingsByPr.get(r.id) ?? null,
        findings_preview: previewByPr.get(r.id) ?? null,
      };
    });
  });

  app.get('/pulls/:id', { schema: { params: IdParams } }, async (req): Promise<PrDetail> => {
    const { workspaceId } = await getContext(container, req);
    const [pr] = await container.db
      .select()
      .from(t.pullRequests)
      .where(
        and(eq(t.pullRequests.workspaceId, workspaceId), eq(t.pullRequests.id, req.params.id)),
      );
    if (!pr) throw new NotFoundError('Pull request not found');
    const [repo] = await container.db
      .select()
      .from(t.repos)
      .where(eq(t.repos.id, pr.repoId));
    if (!repo) throw new NotFoundError('Repo not found');

    // Local-first: refresh detail from GitHub when a token is configured;
    // otherwise serve the persisted files/commits/body (seeded or previously
    // imported) so PR detail works offline.
    try {
      const gh = await container.github();
      const detail = await gh.getPullRequest({ owner: repo.owner, name: repo.name }, pr.number);

      // The files/commits mirror is a DELETE-then-INSERT, which is NOT safe to run
      // concurrently: two overlapping detail fetches for the same PR interleave as
      // (A delete, B delete, A insert, B insert) and leave EVERY path duplicated —
      // which then crashes the diff viewers, whose React keys are `f.path`.
      // React StrictMode's double-effect plus TanStack's refetchOnWindowFocus make
      // that trivially reachable, and the duplicate rows PERSIST once written.
      //
      // A transaction alone does not fix it: under READ COMMITTED, B's DELETE takes
      // its snapshot before A commits, so it can miss the rows A just inserted and
      // duplicate them regardless. The transaction-scoped ADVISORY LOCK is what
      // actually serializes the two refreshes — the second waits for the first to
      // commit, then deletes rows it can see. Keyed on the PR id, so refreshes of
      // different PRs still run in parallel. (Chosen over a UNIQUE (pr_id, path)
      // index because `pr_files` is a pre-existing shared table — see root
      // CLAUDE.md: extend with new tables/columns, never migrate the shared ones.)
      // ONE ENTRY PER PATH — deduped ONCE, here, and used for BOTH the DB mirror and
      // the HTTP response. They must not diverge: the response is what the diff
      // viewers render, and their React key is `f.path`, so a repeated path is a hard
      // crash in the UI. Deduping only the rows we INSERT is not enough — the success
      // path below returns `{ ...detail }`, i.e. GitHub's payload, which never touches
      // the database at all. That gap is exactly how a duplicate `CLAUDE.md` reached
      // the client from a freshly-migrated DB. Last one wins.
      const files = [...new Map(detail.files.map((f) => [f.path, f])).values()];
      const commits = [...new Map(detail.commits.map((c) => [c.sha, c])).values()];

      await container.db.transaction(async (tx) => {
        await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${pr.id}, 0))`);

        await tx.delete(t.prFiles).where(eq(t.prFiles.prId, pr.id));
        if (files.length > 0) {
          await tx.insert(t.prFiles).values(
            files.map((f) => ({
              prId: pr.id,
              path: f.path,
              additions: f.additions,
              deletions: f.deletions,
              patch: f.patch ?? null,
            })),
          );
        }
        await tx.delete(t.prCommits).where(eq(t.prCommits.prId, pr.id));
        if (commits.length > 0) {
          await tx.insert(t.prCommits).values(
            commits.map((c) => ({
              prId: pr.id,
              sha: c.sha,
              message: c.message,
              author: c.author,
              committedAt: c.committed_at ? new Date(c.committed_at) : null,
            })),
          );
        }
      });
      await container.db
        .update(t.pullRequests)
        .set({
          body: detail.body ?? null,
          // Diff stats aren't on GitHub's PR-list payload — backfill them from
          // the detail fetch so the Pull Requests list shows real size/files.
          additions: detail.additions,
          deletions: detail.deletions,
          filesCount: detail.files_count,
        })
        .where(eq(t.pullRequests.id, pr.id));

      // NOT `{ ...detail }` — that is the raw GitHub payload and would leak a repeated
      // path to the viewers. Serve exactly what we persisted.
      return { ...detail, files, commits, id: pr.id };
    } catch (err) {
      app.log.warn({ err }, 'GitHub PR detail refresh skipped (no token / offline); serving persisted detail');
      // Dedupe on READ as well as on write. The write path is now serialized, but
      // rows duplicated by the older racy mirror are already persisted in existing
      // databases — and this offline branch never rewrites them, so without this a
      // token-less install would serve duplicate paths forever and keep crashing the
      // diff viewers (their React keys are `f.path`). Cheap, and it self-heals.
      const fileRows = await container.db.select().from(t.prFiles).where(eq(t.prFiles.prId, pr.id));
      const commitRows = await container.db
        .select()
        .from(t.prCommits)
        .where(eq(t.prCommits.prId, pr.id));
      const files = [...new Map(fileRows.map((f) => [f.path, f])).values()];
      const commits = [...new Map(commitRows.map((c) => [c.sha, c])).values()];
      return {
        id: pr.id,
        number: pr.number,
        title: pr.title,
        author: pr.author,
        branch: pr.branch,
        base: pr.base,
        head_sha: pr.headSha,
        additions: pr.additions,
        deletions: pr.deletions,
        files_count: pr.filesCount,
        status: pr.status as PrDetail['status'],
        opened_at: pr.openedAt?.toISOString() ?? null,
        updated_at: pr.updatedAt?.toISOString() ?? null,
        body: pr.body ?? null,
        files: files.map((f) => ({
          path: f.path,
          additions: f.additions,
          deletions: f.deletions,
          patch: f.patch ?? null,
        })),
        commits: commits.map((c) => ({
          sha: c.sha,
          message: c.message,
          author: c.author,
          committed_at: c.committedAt?.toISOString() ?? null,
        })),
      };
    }
  });

  // ---- Smart Diff (L03) ---------------------------------------------------
  // Regroups the SAME diff by role (core → wiring → boilerplate) and badges the
  // lines the latest review flagged.
  //
  // 🔴 ZERO MODEL CALLS. This handler does NOT touch `container.llm()` — that is
  // the load-bearing invariant of the whole feature. It composes data we already
  // have: `pr_files` (written by GET /pulls/:id) + the latest review's findings,
  // both read through the `container.reviewRepo` facade, then hands them to a
  // PURE builder. `pseudocode_summary` is derived from the patch by
  // `deriveSummary`, not by a model.
  //
  // It also does NOT read `pr_intent`: the `SmartDiff` contract has nowhere to
  // put it (`groups` + `split_suggestion`, nothing else), and the serializer
  // would silently strip an extra key. The client composes the intent context
  // header from the existing `GET /pulls/:id/intent`.
  app.get(
    '/pulls/:id/smart-diff',
    { schema: { params: IdParams, response: { 200: SmartDiffResponse } } },
    async (req): Promise<SmartDiff> => {
      const { workspaceId } = await getContext(container, req);
      // Workspace-scoped: a PR id from another workspace must 404, not leak a
      // diff. `getPrFiles` takes a bare prId, so this check is what enforces it.
      const pr = await container.reviewRepo.getPull(workspaceId, req.params.id);
      if (!pr) throw new NotFoundError('Pull request not found');

      const files = await container.reviewRepo.getPrFiles(pr.id);

      // `reviewsForPull` returns rows newest-first but filters NEITHER `kind`
      // NOR dismissed findings — so do both here:
      //   · summaries are not reviews → filter kind === 'review', take the first
      //     (= the LATEST review, because the rows are already newest-first);
      //   · a dismissed finding must not badge a line (the Findings tab hides
      //     it, so the badge would reveal nothing).
      // No review yet ⇒ no findings ⇒ every `finding_lines: []`, and the
      // grouped layout still renders. Degrade, never 500.
      const reviews = await container.reviewRepo.reviewsForPull(pr.id);
      const latest = reviews.find((r) => r.review.kind === 'review');
      const findings = (latest?.findings ?? [])
        .filter((f) => f.dismissedAt == null)
        .map((f) => ({ file: f.file, startLine: f.startLine }));

      return buildSmartDiff(files, findings);
    },
  );

  // ---- Blast radius (Overview tab) ----------------------------------------
  // "What could this change break?" — the question the diff cannot answer,
  // because the answer lives in the code the diff does NOT show.
  //
  // ZERO model calls. Every fact is read from the repo-intel index that was
  // built once, at clone time: symbols, resolved references, the import graph,
  // file rank, and per-file endpoint/cron facts. This handler resolves the PR,
  // hands its changed files to the `repoIntel` facade, and maps the result into
  // the contract with a PURE builder. No analysis happens at request time.
  app.get(
    '/pulls/:id/blast-radius',
    { schema: { params: IdParams, response: { 200: BlastRadiusResponse } } },
    async (req): Promise<BlastRadius> => {
      const { workspaceId } = await getContext(container, req);
      // Workspace-scoped: a PR id from another workspace must 404, not leak the
      // shape of someone else's codebase. `getPrFiles` takes a bare prId, so
      // this lookup is what enforces it (same posture as smart-diff, above).
      const pr = await container.reviewRepo.getPull(workspaceId, req.params.id);
      if (!pr) throw new NotFoundError('Pull request not found');

      const files = await container.reviewRepo.getPrFiles(pr.id);
      const paths = files.map((f) => f.path);

      // The facade NEVER throws: an unindexed repo, a missing clone or an empty
      // file list all come back as a valid `BlastResult` tagged `degraded`. The
      // route must not undo that — a degraded index is a badge on the card, not
      // a 500 and not an empty panel that reads as "nothing is affected".
      const result = await container.repoIntel.getBlastRadius(pr.repoId, paths);
      return buildBlastRadius(result);
    },
  );

  // ---- Prior PRs touching these files (Blast card) -------------------------
  // Read from the CLONE, not from GitHub and not from a table: a squash-merged
  // PR leaves `(#482)` on the commit subject, so `git log -- <file>` yields the
  // number, title, author and merge date for free. Also zero model calls — the
  // per-PR note is derived from the file overlap, not written by an LLM.
  app.get(
    '/pulls/:id/history',
    { schema: { params: IdParams, response: { 200: PrHistoryResponse } } },
    async (req): Promise<PrHistory> => {
      const { workspaceId } = await getContext(container, req);
      const pr = await container.reviewRepo.getPull(workspaceId, req.params.id);
      if (!pr) throw new NotFoundError('Pull request not found');

      const files = await container.reviewRepo.getPrFiles(pr.id);
      const paths = files.map((f) => f.path);
      const repo = await container.reviewRepo.getRepo(pr.repoId);
      if (!repo || paths.length === 0) return { history: [] };

      const ref: RepoRef = { owner: repo.owner, name: repo.name };

      // Both flags here are load-bearing, and BOTH were learned the hard way:
      //
      //  · `fullHistory` — a PATH-FILTERED `git log` applies history simplification and
      //    SILENTLY OMITS merge commits. Without it, a repo that MERGES its PRs (rather
      //    than squashing them) produces a log with no `Merge pull request #N` subject
      //    in it anywhere, and this route returns an empty history for every PR, forever.
      //  · `maxCount` — bounds the git process itself. An unbounded `git log -- <file>`
      //    walks a file's entire history; a 60-file PR would fire 60 of them on a render.
      //
      // The other half of this fix is upstream: the import clones with `CLONE_DEPTH = 1`,
      // so the repo-intel index job now runs `git fetch --deepen` — otherwise there is no
      // history in the clone to read in the first place.
      const commits: HistoryInputCommit[] = [];
      for (const path of paths.slice(0, HISTORY_MAX_FILES)) {
        try {
          const log = await container.git.log(ref, path, {
            maxCount: HISTORY_MAX_COMMITS_PER_FILE,
            fullHistory: true,
          });
          for (const c of log) commits.push({ ...c, file: path });
        } catch {
          // No clone, a path git doesn't know, a clone still shallow: degrade this file
          // to "no history", never fail the request.
          continue;
        }
      }

      // Enrichment (best-effort): a MERGE commit's subject is only its branch name, and
      // its body — where the real title lives — is sometimes empty. For those, prefer
      // the PR's GitHub title if we happen to have imported it. A prior PR we never
      // imported simply isn't in the map, and the branch-name fallback still applies.
      const titleByNumber = await container.reviewRepo.getPrTitlesForRepo(
        workspaceId,
        pr.repoId,
      );

      return buildPrHistory(commits, paths, pr.number, titleByNumber);
    },
  );

  // ---- Inline review comments (Files changed tab) -------------------------
  // Proxied live to GitHub (no local persistence): GET reflects existing PR
  // comments; POST creates one immediately. Keeps the tab in lock-step with
  // GitHub and avoids a stale local mirror.
  async function resolvePrAndRepo(id: string, workspaceId: string) {
    const [pr] = await container.db
      .select()
      .from(t.pullRequests)
      .where(and(eq(t.pullRequests.workspaceId, workspaceId), eq(t.pullRequests.id, id)));
    if (!pr) throw new NotFoundError('Pull request not found');
    const [repo] = await container.db.select().from(t.repos).where(eq(t.repos.id, pr.repoId));
    if (!repo) throw new NotFoundError('Repo not found');
    return { pr, repo };
  }

  app.get(
    '/pulls/:id/comments',
    { schema: { params: IdParams } },
    async (req): Promise<PrReviewComment[]> => {
      const { workspaceId } = await getContext(container, req);
      const { pr, repo } = await resolvePrAndRepo(req.params.id, workspaceId);
      let gh: GitHubClient;
      try {
        gh = await container.github();
      } catch (err) {
        app.log.warn({ err }, 'GitHub client unavailable; serving no PR comments');
        return [];
      }
      try {
        return await gh.listReviewComments({ owner: repo.owner, name: repo.name }, pr.number);
      } catch (err) {
        app.log.warn({ err }, 'GitHub review-comments fetch skipped (offline / error)');
        return [];
      }
    },
  );

  app.post(
    '/pulls/:id/comments',
    { schema: { params: IdParams, body: PrCommentInput } },
    async (req): Promise<PrReviewComment> => {
      const { workspaceId } = await getContext(container, req);
      const { pr, repo } = await resolvePrAndRepo(req.params.id, workspaceId);
      const input = req.body;
      let gh: GitHubClient;
      try {
        gh = await container.github();
      } catch {
        throw new AppError(
          'github_unavailable',
          'Connect a GitHub token to post comments.',
          400,
        );
      }
      try {
        return await gh.createReviewComment({ owner: repo.owner, name: repo.name }, pr.number, {
          commitId: pr.headSha,
          path: input.path,
          line: input.line,
          ...(input.side ? { side: input.side } : {}),
          body: input.body,
          ...(input.in_reply_to != null ? { inReplyTo: input.in_reply_to } : {}),
        });
      } catch (err) {
        // GitHub rejects comments on lines outside the diff / on closed PRs (422).
        const msg = err instanceof Error ? err.message : 'Failed to post the comment to GitHub.';
        throw new AppError('github_comment_failed', msg, 400, { cause: String(err) });
      }
    },
  );
}
