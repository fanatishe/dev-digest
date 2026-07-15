/**
 * APPLICATION ring — `get_blast_radius` (§5.5).
 *
 * Was a stub until the API grew `GET /pulls/:id/blast-radius`. The wiring is exactly
 * the three steps the stub's own message promised: a route, a port method, a service.
 * The tool's name, description and `inputSchema` did not change — that is what
 * freezing the input contract up front bought.
 *
 * FREE. `GET /pulls/:id/blast-radius` reads a pre-built index (symbols, resolved
 * references, the import graph, per-file endpoint facts) computed once at clone time.
 * It makes no model call, so this service is safe to call as often as the model likes
 * — unlike `run_agent_on_pr`, which is the one billable tool in this package.
 *
 * It receives the `ApiPort`; it never constructs one.
 */
import { blastDegradedMessage, toToolError } from '../errors.js';
import { blastMarkdown, toBlastImpactSummary, truncationHint } from '../format.js';
import type { ApiPort, McpConfig } from '../ports.js';
import { resolveTarget } from '../resolve.js';
import type { BlastRadiusResult } from '../types.js';

/**
 * Callers shown PER SYMBOL. The API already caps at 20 per symbol when it reads the
 * index; this is the wire-projection cap on top of that, because a model answering
 * "what could this break?" needs the shape of the fan-out, not every call site. The
 * projection carries `total_callers`, so the cap is always visible.
 */
export const MAX_CALLERS_SHOWN = 8;

/** Changed symbols shown. A refactor can touch dozens; the reviewer reads a few. */
export const MAX_SYMBOLS_SHOWN = 10;

export interface GetBlastRadiusInput {
  repo: string;
  pr: string | number;
}

export class BlastService {
  constructor(
    private readonly api: ApiPort,
    private readonly config: McpConfig,
  ) {}

  async getBlastRadius(input: GetBlastRadiusInput): Promise<BlastRadiusResult> {
    try {
      return await this.doGetBlastRadius(input);
    } catch (err) {
      throw toToolError(err, this.config.apiUrl);
    }
  }

  private async doGetBlastRadius({ repo, pr }: GetBlastRadiusInput): Promise<BlastRadiusResult> {
    // Resolve first, always. `pull_requests.id` is a uuid column — forwarding a PR
    // NUMBER as an id reaches Postgres as `invalid input syntax for type uuid` and
    // comes back a 500, not a clean 404.
    const target = await resolveTarget(this.api, repo, pr);
    const blast = await this.api.getBlastRadius(target.pr.id);

    const downstream = blast.downstream
      .slice(0, MAX_SYMBOLS_SHOWN)
      .map((d) => toBlastImpactSummary(d, MAX_CALLERS_SHOWN));

    // Union across symbols — two symbols reaching the same endpoint is ONE endpoint
    // at risk, and the flat list is what a model scans first.
    const endpoints = [...new Set(blast.downstream.flatMap((d) => d.endpoints_affected))];
    const crons = [...new Set(blast.downstream.flatMap((d) => d.crons_affected))];

    const degraded = blast.degraded === true;

    // `next` always names the onward step. The DEGRADED case takes priority over a
    // truncation hint: an empty blast radius from an unindexed repo reads exactly like
    // "nothing is affected", and that is the most dangerous thing this tool could
    // imply. Say "unknown" out loud.
    const next = degraded
      ? blastDegradedMessage(target.repo.full_name, blast.reason ?? null)
      : truncationHint(
          downstream.length,
          blast.downstream.length,
          'changed symbols',
          'get_blast_radius',
        );

    return {
      repo: target.repo.full_name,
      pr: target.pr.number,
      summary: blast.summary,
      changed_symbols: blast.changed_symbols.slice(0, MAX_SYMBOLS_SHOWN),
      downstream,
      endpoints_affected: endpoints,
      crons_affected: crons,
      degraded,
      next,
    };
  }

  /** The markdown `content` block — a summary of the structured payload, never a dump. */
  markdown(result: BlastRadiusResult): string {
    return blastMarkdown(result);
  }
}
