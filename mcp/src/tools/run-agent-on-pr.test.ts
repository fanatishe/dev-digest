import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { McpConfig } from '../ports.js';
import { ApiError } from '../errors.js';
import type { ApiPort } from '../ports.js';
import { ReviewService } from '../services/review.service.js';
import type {
  Agent,
  FindingRecord,
  PrMeta,
  Repo,
  ReviewRecord,
  ReviewRunResponse,
  RunSummary,
} from '../types.js';
import { registerRunAgentOnPrTool } from './run-agent-on-pr.js';

const REPO_ID = '11111111-1111-4111-8111-111111111111';
const PR_ID = '22222222-2222-4222-8222-222222222222';
const AGENT_ID = '33333333-3333-4333-8333-333333333333';
const RUN_ID = '44444444-4444-4444-8444-444444444444';

// ---- fixtures --------------------------------------------------------------------

const repo: Repo = {
  id: REPO_ID,
  workspace_id: 'ws',
  owner: 'acme',
  name: 'payments-api',
  full_name: 'acme/payments-api',
  default_branch: 'main',
  clone_path: null,
  last_polled_at: null,
  created_by: null,
};

const pr: PrMeta = {
  id: PR_ID,
  number: 482,
  title: 'Add rate limiting',
  author: 'dev',
  branch: 'feat/rl',
  base: 'main',
  head_sha: 'abc',
  additions: 10,
  deletions: 2,
  files_count: 3,
  status: 'needs_review',
};

const agent: Agent = {
  id: AGENT_ID,
  name: 'Security',
  description: 'Security reviewer',
  provider: 'openai',
  model: 'gpt-4.1',
  system_prompt: 'A MULTI-KILOBYTE PROMPT',
  enabled: true,
  version: 1,
  strategy: 'single-pass',
  ci_fail_on: 'critical',
  repo_intel: true,
};

const finding = (over: Partial<FindingRecord> = {}): FindingRecord => ({
  id: 'f-1',
  review_id: 'rev-1',
  accepted_at: null,
  dismissed_at: null,
  severity: 'CRITICAL',
  category: 'security',
  title: 'Unbounded query',
  file: 'src/db/users.ts',
  start_line: 42,
  end_line: 58,
  rationale: 'No `.limit()` — a large table exhausts memory.',
  suggestion: 'Add `.limit(100)`.',
  confidence: 0.9,
  kind: 'finding',
  ...over,
});

const runSummary = (over: Partial<RunSummary> = {}): RunSummary => ({
  run_id: RUN_ID,
  agent_id: AGENT_ID,
  agent_name: 'Security',
  provider: 'openai',
  model: 'gpt-4.1',
  status: 'done',
  error: null,
  duration_ms: 4_200,
  tokens_in: 100,
  tokens_out: 50,
  cost_usd: 0.031,
  findings_count: 1,
  grounding: null,
  ran_at: '2026-07-13T10:00:00Z',
  score: 40,
  blockers: 1,
  ...over,
});

const reviewRecord = (over: Partial<ReviewRecord> = {}): ReviewRecord => ({
  id: 'rev-1',
  pr_id: PR_ID,
  agent_id: AGENT_ID,
  run_id: RUN_ID,
  agent_name: 'Security',
  kind: 'review',
  verdict: 'request_changes',
  summary: 'One critical issue.',
  score: 40,
  model: 'gpt-4.1',
  created_at: '2026-07-13T10:00:00Z',
  findings: [finding()],
  ...over,
});

/**
 * A `kind: 'summary'` row for the SAME run_id. It is newest-first, so it sits at [0]:
 * delete the `kind === 'review'` filter in the service and this row is what the model
 * gets handed as "the review". The fixture exists so that bug cannot ship green.
 */
const summaryRecord = (): ReviewRecord =>
  reviewRecord({
    id: 'sum-1',
    kind: 'summary',
    verdict: null,
    summary: 'A digest, not a review.',
    score: null,
    findings: [],
  });

const CONFIG: McpConfig = {
  apiUrl: 'http://localhost:3001',
  pollIntervalMs: 1_000,
  firstPollDelayMs: 1_000,
  runTimeoutMs: 3_000,
  httpTimeoutMs: 30_000,
  cacheTtlMs: 60_000,
};

// ---- harness ---------------------------------------------------------------------

interface ToolResult {
  isError?: boolean;
  content: { type: string; text: string }[];
  structuredContent?: Record<string, unknown>;
}
type Handler = (args: { repo: string; pr: string | number; agent: string }) => Promise<ToolResult>;

function mockApi(over: Partial<ApiPort> = {}): ApiPort {
  return {
    health: vi.fn(async () => ({ status: 'ok' })),
    listRepos: vi.fn(async () => [repo]),
    listPulls: vi.fn(async () => [pr]),
    listAgents: vi.fn(async () => [agent]),
    startReview: vi.fn(
      async (): Promise<ReviewRunResponse> => ({
        pr_id: PR_ID,
        runs: [{ run_id: RUN_ID, agent_id: AGENT_ID, agent_name: 'Security' }],
        // FIRE-AND-FORGET: always empty. Findings come only from listReviews().
        reviews: [],
      }),
    ),
    listRuns: vi.fn(async () => [runSummary()]),
    listReviews: vi.fn(async () => [summaryRecord(), reviewRecord()]),
    listConventions: vi.fn(async () => []),
    getBlastRadius: vi.fn(async () => ({ changed_symbols: [], downstream: [], summary: '', degraded: false, reason: null })),
    ...over,
  };
}

/**
 * Captures the registered handler with a plain object standing in for `McpServer` — no
 * MCP SDK in the loop, which is the whole point of keeping the handler thin.
 */
function handlerFor(api: ApiPort): Handler {
  let captured: Handler | undefined;
  const server = {
    registerTool: (_name: string, _config: unknown, cb: Handler) => {
      captured = cb;
    },
  } as unknown as McpServer;

  registerRunAgentOnPrTool(server, new ReviewService(api, CONFIG, async () => {}));
  if (!captured) throw new Error('run_agent_on_pr did not register a handler');
  return captured;
}

const ARGS = { repo: 'acme/payments-api', pr: 482, agent: 'Security' } as const;

describe('run_agent_on_pr — the only tool that spends money (§5.2)', () => {
  beforeEach(() => vi.clearAllMocks());

  it('resolves, starts EXACTLY ONE review, waits, and returns the verdict + findings', async () => {
    const api = mockApi();
    const result = await handlerFor(api)({ ...ARGS });

    // THE assertion that can fail for the right reason: a second POST is a second bill.
    expect(api.startReview).toHaveBeenCalledTimes(1);
    // …and never with the agent NAME: `agents.id` is a uuid column, so a name reaches
    // Postgres as `invalid input syntax for type uuid` → a 500, not a clean 404.
    expect(api.startReview).toHaveBeenCalledWith(PR_ID, AGENT_ID);

    expect(result.isError).toBe(false);
    expect(result.structuredContent).toMatchObject({
      status: 'done',
      run_id: RUN_ID,
      agent: 'Security',
      verdict: 'request_changes',
      score: 40,
      total_findings: 1,
      cost_usd: 0.031,
    });
    expect(result.structuredContent?.findings).toHaveLength(1);

    const text = result.content[0]?.text ?? '';
    expect(text).toContain('request_changes');
    expect(text).toContain('Unbounded query');
    // The markdown block is a SUMMARY, never JSON.stringify of structuredContent (§5.6).
    expect(text).not.toContain('{"');
  });

  it('ignores the `kind: "summary"` row when collecting the review', async () => {
    // Both rows carry this run_id and the summary is newest-first. Without the
    // `kind === 'review'` filter the model would be handed the summary as the review.
    const api = mockApi();
    const result = await handlerFor(api)({ ...ARGS });

    expect(result.structuredContent).toMatchObject({ verdict: 'request_changes', score: 40 });
    expect(result.structuredContent?.summary).toBe('One critical issue.');
  });

  it('never reads findings from the fire-and-forget POST response', async () => {
    const api = mockApi();
    await handlerFor(api)({ ...ARGS });

    // `ReviewRunResponse.reviews` is always [] — the executor runs un-awaited. The only
    // legitimate source of findings is listReviews(), after the run leaves `running`.
    expect(api.listReviews).toHaveBeenCalledWith(PR_ID);
  });

  it('TIMEOUT: returns isError:false, status "running", and points at get_findings with the run_id', async () => {
    const api = mockApi({ listRuns: vi.fn(async () => [runSummary({ status: 'running' })]) });
    const result = await handlerFor(api)({ ...ARGS });

    // isError:false is deliberate: an error result invites a retry, and a retry here is
    // a SECOND BILL. The run is not cancelled and not re-POSTed.
    expect(result.isError).toBe(false);
    expect(api.startReview).toHaveBeenCalledTimes(1);

    expect(result.structuredContent).toMatchObject({ status: 'running', run_id: RUN_ID });
    expect(result.structuredContent?.findings).toEqual([]);

    const text = result.content[0]?.text ?? '';
    expect(text).toContain('Do NOT call run_agent_on_pr again');
    expect(text).toContain('get_findings');
    expect(text).toContain(RUN_ID);
    expect(text).toContain('has NOT been');
  });

  it('FAILED: surfaces the run error and does not retry', async () => {
    const api = mockApi({
      listRuns: vi.fn(async () => [
        runSummary({ status: 'failed', error: 'provider 401: invalid api key' }),
      ]),
    });
    const result = await handlerFor(api)({ ...ARGS });

    expect(result.isError).toBe(true);
    expect(api.startReview).toHaveBeenCalledTimes(1);
    expect(result.content[0]?.text).toContain('provider 401: invalid api key');
    expect(result.structuredContent).toMatchObject({ status: 'failed', total_findings: 0 });
  });

  it('429: returns the rate-limit message, which points at get_findings', async () => {
    const api = mockApi({
      startReview: vi.fn(async () => {
        throw new ApiError(429, 'rate_limited', 'Too many review requests');
      }),
    });
    const result = await handlerFor(api)({ ...ARGS });

    expect(result.isError).toBe(true);
    expect(result.content[0]?.text).toBe(
      'Reviews are rate-limited to 10/minute. Wait a minute and retry — ' +
        'or call get_findings to read a review you already paid for.',
    );
    // One attempt. No retry loop — that is what turns a 429 into a bill.
    expect(api.startReview).toHaveBeenCalledTimes(1);
  });

  it('an unknown agent never reaches the API — no POST, no 500, no spend', async () => {
    const api = mockApi();
    const result = await handlerFor(api)({ ...ARGS, agent: 'secuirty' });

    expect(api.startReview).not.toHaveBeenCalled();
    expect(result.isError).toBe(true);
    expect(result.content[0]?.text).toContain('call list_agents');
  });
});
