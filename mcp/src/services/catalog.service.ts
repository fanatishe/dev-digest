/**
 * APPLICATION ring — the READ side: agents + conventions.
 *
 * Constraints (from the plan, not negotiable):
 *  - `listAgents()` MUST strip `system_prompt` (multi-KB) — use `toAgentSummary`.
 *  - This service NEVER issues a POST. In particular never
 *    `POST /repos/:id/conventions/extract` — extraction is a PAID model call, and
 *    `get_conventions` is read-only on purpose.
 *  - It receives the `ApiPort`; it never constructs one.
 */
import type { McpConfig } from '../ports.js';
import { noConventionsMessage, toToolError } from '../errors.js';
import { toAgentSummary, toConventionSummary, truncationHint } from '../format.js';
import type { ApiPort } from '../ports.js';
import { resolveRepo } from '../resolve.js';
import type { AgentsResult, ConventionsResult } from '../types.js';

export interface GetConventionsInput {
  repo: string;
  acceptedOnly: boolean;
  limit: number;
}

/**
 * Every failure this ring can raise is normalized into a model-facing `ToolError` that
 * names the next step: an unreachable API renders "…start it with ./scripts/dev.sh", a
 * decoded `ApiError` (e.g. a 500 from `GET /agents`) renders "…check the API log in the
 * terminal running ./scripts/dev.sh", and a 429 renders the rate-limit message. A
 * `ToolError` already written by `resolve.ts` passes through untouched.
 *
 * `toToolError` needs the base URL to say WHERE, which is the whole reason this service
 * takes the config and not just the port.
 */
async function callApi<T>(call: () => Promise<T>, baseUrl: string): Promise<T> {
  // try/catch, not `.catch()`: `call()` may throw SYNCHRONOUSLY, and a `.catch()`
  // handler only ever sees a rejected promise — a sync throw would escape unwrapped.
  try {
    return await call();
  } catch (err) {
    throw toToolError(err, baseUrl);
  }
}

export class CatalogService {
  constructor(
    private readonly api: ApiPort,
    private readonly config: McpConfig,
  ) {}

  /**
   * `GET /agents` → `AgentSummary[]`. The projection is the point: a raw `Agent` carries
   * a multi-KB `system_prompt` (plus `output_schema`, `version`, `strategy`, `ci_fail_on`,
   * `repo_intel`, `provider`) — the single biggest response-bloat source in this surface,
   * and nothing the model can act on. No `limit`: a workspace has a handful of agents.
   */
  async listAgents(): Promise<AgentsResult> {
    const agents = await callApi(() => this.api.listAgents(), this.config.apiUrl);
    const summaries = agents.map(toAgentSummary);
    return { agents: summaries, total: summaries.length };
  }

  /**
   * resolve repo → `GET /repos/:id/conventions` → filter → project (drops `id` and
   * `evidence_sha`, truncates the raw-blob snippet) → cap at `limit` with an "N more"
   * hint. Two GETs, no POST: extraction is a paid call and is not exposed.
   */
  async getConventions({ repo, acceptedOnly, limit }: GetConventionsInput): Promise<ConventionsResult> {
    const repoRow = await callApi(() => resolveRepo(this.api, repo), this.config.apiUrl);
    const all = await callApi(() => this.api.listConventions(repoRow.id), this.config.apiUrl);

    const matching = acceptedOnly ? all.filter((c) => c.accepted) : all;
    const total = matching.length;
    const conventions = matching.slice(0, limit).map(toConventionSummary);

    // `next` always names the next step: how to extract when there are none, or how to
    // ask for the rest when the list was capped.
    const next =
      total === 0
        ? noConventionsMessage(repoRow.full_name)
        : truncationHint(conventions.length, total, 'conventions', 'get_conventions');

    return { repo: repoRow.full_name, conventions, total, next };
  }
}
