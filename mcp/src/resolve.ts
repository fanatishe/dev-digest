/**
 * APPLICATION ring — identifier resolution over the PORT (§7).
 *
 * Every tool accepts human identifiers ("acme/payments-api", 482, "Security") *or*
 * uuids. The API accepts neither half of that: its path params are
 * `z.object({ id: z.string().uuid() })` (a non-uuid is a 422), and — worse —
 * `RunRequest.agentId` is a bare `z.string()` while `agents.id` is a `uuid` COLUMN, so
 * an agent NAME reaches Postgres as `invalid input syntax for type uuid` and comes
 * back as a **500, not a clean 404**.
 *
 * Therefore: this module is the only thing that talks identifiers, and it resolves to
 * a uuid or throws a `ToolError` that names the next tool. A non-uuid is NEVER
 * forwarded to the API.
 *
 * It takes an `ApiPort` as an argument and never constructs one.
 */
import {
  ToolError,
  agentNotFoundMessage,
  noAgentsMessage,
  prNotFoundMessage,
  prNotSyncedMessage,
  repoNotFoundMessage,
} from './errors.js';
import type { ApiPort } from './ports.js';
import type { Agent, Repo, SyncedPr } from './types.js';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(value: string): boolean {
  return UUID_RE.test(value);
}

/** `"482"` and `482` are the same PR number; `"acme/x"` is not a number. */
function asPrNumber(pr: string | number): number | null {
  if (typeof pr === 'number') return Number.isInteger(pr) && pr > 0 ? pr : null;
  return /^\d+$/.test(pr.trim()) ? Number(pr.trim()) : null;
}

/**
 * `repo` → the `Repo` row. uuid → matched by id; otherwise matched on `full_name`,
 * case-insensitively. A uuid is still verified against the list — a stale uuid must
 * fail here with "import it", not as a 404 three calls later.
 */
export async function resolveRepo(api: ApiPort, repo: string): Promise<Repo> {
  const needle = repo.trim();
  const repos = await api.listRepos();

  const match = isUuid(needle)
    ? repos.find((r) => r.id === needle)
    : repos.find((r) => r.full_name.toLowerCase() === needle.toLowerCase());

  if (!match) {
    throw new ToolError(
      repoNotFoundMessage(
        repo,
        repos.map((r) => r.full_name),
      ),
    );
  }
  return match;
}

/**
 * `pr` → a PR that exists LOCALLY. `PrMeta.id` is `nullish` in the contract: a PR
 * listed from GitHub but not yet persisted has no local uuid and cannot be reviewed —
 * that is a message, not a crash.
 */
export async function resolvePr(
  api: ApiPort,
  repo: Repo,
  pr: string | number,
): Promise<SyncedPr> {
  const pulls = await api.listPulls(repo.id);
  const number = asPrNumber(pr);

  const match =
    number !== null
      ? pulls.find((p) => p.number === number)
      : pulls.find((p) => typeof p.id === 'string' && p.id === String(pr).trim());

  if (!match) {
    throw new ToolError(
      prNotFoundMessage(
        pr,
        repo.full_name,
        pulls.map((p) => p.number),
      ),
    );
  }
  if (typeof match.id !== 'string' || match.id.length === 0) {
    throw new ToolError(prNotSyncedMessage(match.number, repo.full_name));
  }
  return { ...match, id: match.id };
}

/**
 * `agent` → an `Agent` whose `id` is a uuid. A uuid is matched by id (and still
 * VERIFIED — see the 500 above); anything else is matched on `name`,
 * case-insensitively. The caller therefore cannot forward a name to the API even by
 * accident: this function's only success value carries a real row's uuid.
 */
export async function resolveAgent(api: ApiPort, agent: string): Promise<Agent> {
  const needle = agent.trim();
  const agents = await api.listAgents();

  if (agents.length === 0) throw new ToolError(noAgentsMessage());

  const match = isUuid(needle)
    ? agents.find((a) => a.id === needle)
    : agents.find((a) => a.name.toLowerCase() === needle.toLowerCase());

  if (!match) throw new ToolError(agentNotFoundMessage(agent));
  return match;
}

/** Convenience for the two tools that need both: one repo lookup, one pulls lookup. */
export async function resolveTarget(
  api: ApiPort,
  repo: string,
  pr: string | number,
): Promise<{ repo: Repo; pr: SyncedPr }> {
  const repoRow = await resolveRepo(api, repo);
  const prRow = await resolvePr(api, repoRow, pr);
  return { repo: repoRow, pr: prRow };
}
