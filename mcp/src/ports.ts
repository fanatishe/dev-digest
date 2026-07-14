/**
 * PORTS ring — the interface the application ring programs against.
 *
 * `api/http-client.ts` is its ONE implementation; `index.ts` (the composition root)
 * is the ONE place that constructs it. Services and `resolve.ts` receive an `ApiPort`
 * as an argument and never construct one — which is exactly what lets their tests
 * inject a plain object instead of stubbing `fetch`.
 *
 * Every method below maps 1:1 onto an endpoint that already exists on the DevDigest
 * API (no auth: `LocalNoAuthProvider` returns one seeded workspace).
 */
import type {
  Agent,
  BlastRadius,
  ConventionCandidate,
  PrMeta,
  Repo,
  ReviewRecord,
  ReviewRunResponse,
  RunSummary,
} from './types.js';

/**
 * The knobs the application and infrastructure rings are configured with.
 *
 * It lives HERE, not in `config.ts`, on purpose. Services take an `McpConfig` as a
 * constructor argument, and `config.ts` is the INFRASTRUCTURE ring — so importing the
 * type from there would point the application ring *outward*, the one direction the
 * onion forbids. `config.ts` (which reads `process.env`) imports this interface and
 * returns it; nothing imports `config.ts` except the composition root.
 */
export interface McpConfig {
  /** Base URL, never with a trailing slash. */
  readonly apiUrl: string;
  readonly pollIntervalMs: number;
  /** The first poll waits longer: a run is never done in 200ms. */
  readonly firstPollDelayMs: number;
  readonly runTimeoutMs: number;
  readonly httpTimeoutMs: number;
  /** TTL of the adapter's in-process GET cache (§7). */
  readonly cacheTtlMs: number;
}

export interface ApiPort {
  /** `GET /health` — liveness only; throws `ApiUnreachableError` when the API is down. */
  health(): Promise<{ status: string }>;

  /** `GET /repos` */
  listRepos(): Promise<Repo[]>;

  /**
   * `GET /repos/:id/pulls` — HEAVYWEIGHT: it syncs from GitHub *and* enqueues a
   * BILLABLE intent job for any PR without a `pr_intent` row. The implementation
   * carries a short TTL cache so one tool call resolves a PR once, not once per step.
   */
  listPulls(repoId: string): Promise<PrMeta[]>;

  /** `GET /agents` */
  listAgents(): Promise<Agent[]>;

  /**
   * `POST /pulls/:id/review` — the ONLY write in this package, and a PAID model call.
   * `agentId` MUST already be a uuid (`agents.id` is a `uuid` column and `RunRequest`
   * does not check it — a name reaches Postgres as `invalid input syntax for type
   * uuid` → a 500, not a clean 404).
   *
   * Fire-and-forget: the response's `reviews` array is ALWAYS `[]` (the executor runs
   * un-awaited). Findings come only from `listReviews()` once the run leaves `running`.
   */
  startReview(prId: string, agentId: string): Promise<ReviewRunResponse>;

  /** `GET /pulls/:id/runs` — the poll target; `status ∈ running|done|failed|cancelled`. */
  listRuns(prId: string): Promise<RunSummary[]>;

  /** `GET /pulls/:id/reviews` — newest-first; `kind` is `'summary' | 'review'`. */
  listReviews(prId: string): Promise<ReviewRecord[]>;

  /** `GET /repos/:id/conventions` */
  listConventions(repoId: string): Promise<ConventionCandidate[]>;

  /**
   * `GET /pulls/:id/blast-radius` — which symbols the PR changes and what downstream
   * code calls them.
   *
   * FREE, and free by construction: the API reads a pre-built index (symbols, resolved
   * references, the import graph, per-file endpoint facts) that was computed once when
   * the repo was cloned. It makes no model call, so neither does this.
   *
   * NEVER throws on an unindexed repo — it answers with `degraded: true` and empty
   * arrays. Treat an empty, degraded result as "we don't know", NOT as "nothing is
   * affected".
   */
  getBlastRadius(prId: string): Promise<BlastRadius>;
}
