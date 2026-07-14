/**
 * INFRASTRUCTURE ring — the ONE implementation of `ApiPort`, and the ONE module in
 * this package that calls `fetch()`. `index.ts` is the only place that constructs it.
 *
 * Two things live here on purpose:
 *
 *  1. **Error decoding.** A non-2xx from the API carries an `ApiErrorBody`
 *     (`{error:{code,message,details?}}`); it is decoded into a typed `ApiError` so the
 *     domain never sees a `Response`. A transport failure becomes `ApiUnreachableError`
 *     — which is what "the API is not running" looks like from here.
 *
 *  2. **The 60s TTL cache** on the two read endpoints used during identifier
 *     resolution. `GET /repos/:id/pulls` syncs from GitHub AND enqueues a BILLABLE
 *     intent job, so one tool call must resolve a PR ONCE, not once per step. Caching
 *     is an infrastructure concern — the service stays pure orchestration.
 *
 * We do NOT re-`.parse()` responses: the API already validated them on the way out
 * through `fastify-type-provider-zod`. Type them; don't re-parse them.
 */
import { ApiError, ApiUnreachableError } from '../errors.js';
import type { McpConfig } from '../ports.js';
import type { ApiPort } from '../ports.js';
import type {
  Agent,
  ApiErrorBody,
  ConventionCandidate,
  PrMeta,
  Repo,
  ReviewRecord,
  ReviewRunResponse,
  RunSummary,
} from '../types.js';

interface CacheEntry {
  expiresAt: number;
  value: Promise<unknown>;
}

/** Narrow an unknown JSON body to the API's error envelope without importing its zod. */
function decodeErrorBody(body: unknown): ApiErrorBody['error'] | null {
  if (typeof body !== 'object' || body === null) return null;
  const err = (body as { error?: unknown }).error;
  if (typeof err !== 'object' || err === null) return null;
  const { code, message } = err as { code?: unknown; message?: unknown };
  if (typeof code !== 'string' || typeof message !== 'string') return null;
  return { code, message, details: (err as { details?: unknown }).details };
}

export class HttpApiClient implements ApiPort {
  private readonly cache = new Map<string, CacheEntry>();

  constructor(
    private readonly config: McpConfig,
    private readonly now: () => number = Date.now,
  ) {}

  // ---- transport --------------------------------------------------------------

  private async request<T>(path: string, init?: RequestInit): Promise<T> {
    const url = `${this.config.apiUrl}${path}`;
    let res: Response;
    try {
      res = await fetch(url, {
        ...init,
        headers: { accept: 'application/json', ...(init?.headers ?? {}) },
        signal: AbortSignal.timeout(this.config.httpTimeoutMs),
      });
    } catch (cause) {
      // Connection refused / DNS / abort — the API is not reachable at all.
      throw new ApiUnreachableError(this.config.apiUrl, cause);
    }

    const body: unknown = await res.json().catch(() => null);

    if (!res.ok) {
      const decoded = decodeErrorBody(body);
      throw new ApiError(
        res.status,
        decoded?.code ?? 'http_error',
        decoded?.message ?? `${res.status} ${res.statusText}`,
        decoded?.details,
      );
    }
    return body as T;
  }

  /** GET + TTL cache. Concurrent callers share the in-flight promise. */
  private cachedGet<T>(path: string): Promise<T> {
    const hit = this.cache.get(path);
    if (hit && hit.expiresAt > this.now()) return hit.value as Promise<T>;

    const value = this.request<T>(path);
    this.cache.set(path, { expiresAt: this.now() + this.config.cacheTtlMs, value });
    // A failed call must not be cached — the next attempt should really retry.
    value.catch(() => this.cache.delete(path));
    return value;
  }

  // ---- ApiPort ----------------------------------------------------------------

  health(): Promise<{ status: string }> {
    return this.request<{ status: string }>('/health');
  }

  listRepos(): Promise<Repo[]> {
    return this.cachedGet<Repo[]>('/repos');
  }

  listPulls(repoId: string): Promise<PrMeta[]> {
    return this.cachedGet<PrMeta[]>(`/repos/${encodeURIComponent(repoId)}/pulls`);
  }

  listAgents(): Promise<Agent[]> {
    // NOT cached: cheap, and a 60s-stale agent list would hide an agent the user
    // just created in the UI — exactly the case where they call list_agents again.
    return this.request<Agent[]>('/agents');
  }

  startReview(prId: string, agentId: string): Promise<ReviewRunResponse> {
    // NOT cached, ever: this is the billable write.
    return this.request<ReviewRunResponse>(`/pulls/${encodeURIComponent(prId)}/review`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ agentId }),
    });
  }

  listRuns(prId: string): Promise<RunSummary[]> {
    // NOT cached: this is the poll target — a cached run status would never finish.
    return this.request<RunSummary[]>(`/pulls/${encodeURIComponent(prId)}/runs`);
  }

  listReviews(prId: string): Promise<ReviewRecord[]> {
    // NOT cached: read immediately after a run completes.
    return this.request<ReviewRecord[]>(`/pulls/${encodeURIComponent(prId)}/reviews`);
  }

  listConventions(repoId: string): Promise<ConventionCandidate[]> {
    return this.request<ConventionCandidate[]>(
      `/repos/${encodeURIComponent(repoId)}/conventions`,
    );
  }
}
