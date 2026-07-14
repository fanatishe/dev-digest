import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { McpConfig } from '../ports.js';
import type { ApiPort } from '../ports.js';
import { ReviewService } from '../services/review.service.js';
import type {
  Agent,
  Detail,
  FindingRecord,
  PrMeta,
  Repo,
  ReviewRecord,
  RunSummary,
} from '../types.js';
import { registerGetFindingsTool } from './get-findings.js';

const REPO_ID = '11111111-1111-4111-8111-111111111111';
const PR_ID = '22222222-2222-4222-8222-222222222222';
const AGENT_ID = '33333333-3333-4333-8333-333333333333';
const RUN_NEW = '44444444-4444-4444-8444-444444444444';
const RUN_OLD = '55555555-5555-4555-8555-555555555555';

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

const finding = (n: number): FindingRecord => ({
  id: `f-${n}`,
  review_id: 'rev-new',
  accepted_at: null,
  dismissed_at: null,
  severity: 'WARNING',
  category: 'bug',
  title: `Issue ${n}`,
  file: `src/file-${n}.ts`,
  start_line: n,
  end_line: n,
  rationale: `RATIONALE-${n} — the unbounded markdown blob.`,
  suggestion: `SUGGESTION-${n}`,
  confidence: 0.7,
  kind: 'finding',
});

const review = (over: Partial<ReviewRecord> = {}): ReviewRecord => ({
  id: 'rev-new',
  pr_id: PR_ID,
  agent_id: AGENT_ID,
  run_id: RUN_NEW,
  agent_name: 'Security',
  kind: 'review',
  verdict: 'request_changes',
  summary: 'Newest review.',
  score: 40,
  model: 'gpt-4.1',
  created_at: '2026-07-13T12:00:00Z',
  findings: [finding(1), finding(2), finding(3)],
  ...over,
});

/**
 * `ReviewRecord.kind` is `'summary' | 'review'`, and the API returns NEWEST-FIRST — so
 * a summary row sits at [0] and an unfiltered `[0]` hands the model a digest and calls
 * it the review. This fixture is what makes deleting the filter fail the suite.
 */
const summary = (): ReviewRecord =>
  review({
    id: 'sum-1',
    kind: 'summary',
    run_id: RUN_NEW,
    verdict: null,
    summary: 'A digest, not a review.',
    score: null,
    findings: [],
    created_at: '2026-07-13T12:30:00Z',
  });

const olderReview = (): ReviewRecord =>
  review({
    id: 'rev-old',
    run_id: RUN_OLD,
    verdict: 'approve',
    summary: 'Older review.',
    score: 95,
    findings: [],
    created_at: '2026-07-13T09:00:00Z',
  });

const runSummary = (over: Partial<RunSummary> = {}): RunSummary => ({
  run_id: RUN_NEW,
  agent_id: AGENT_ID,
  agent_name: 'Security',
  provider: 'openai',
  model: 'gpt-4.1',
  status: 'done',
  error: null,
  duration_ms: null,
  tokens_in: null,
  tokens_out: null,
  cost_usd: null,
  findings_count: null,
  grounding: null,
  ran_at: null,
  score: null,
  blockers: null,
  ...over,
});

const CONFIG: McpConfig = {
  apiUrl: 'http://localhost:3001',
  pollIntervalMs: 1_000,
  firstPollDelayMs: 1_000,
  runTimeoutMs: 180_000,
  httpTimeoutMs: 30_000,
  cacheTtlMs: 60_000,
};

// ---- harness ---------------------------------------------------------------------

interface ToolResult {
  isError?: boolean;
  content: { type: string; text: string }[];
  structuredContent?: Record<string, unknown>;
}
interface Args {
  repo: string;
  pr: string | number;
  run_id?: string;
  detail: Detail;
  limit: number;
}
type Handler = (args: Args) => Promise<ToolResult>;

function mockApi(over: Partial<ApiPort> = {}): ApiPort {
  return {
    health: vi.fn(async () => ({ status: 'ok' })),
    listRepos: vi.fn(async () => [repo]),
    listPulls: vi.fn(async () => [pr]),
    listAgents: vi.fn(async () => [agent]),
    startReview: vi.fn(),
    listRuns: vi.fn(async () => [runSummary()]),
    // Newest-first, exactly as the API returns them: summary, newest review, older review.
    listReviews: vi.fn(async () => [summary(), review(), olderReview()]),
    listConventions: vi.fn(async () => []),
    getBlastRadius: vi.fn(async () => ({ changed_symbols: [], downstream: [], summary: '', degraded: false, reason: null })),
    ...over,
  } as unknown as ApiPort;
}

function handlerFor(api: ApiPort): Handler {
  let captured: Handler | undefined;
  const server = {
    registerTool: (_name: string, _config: unknown, cb: Handler) => {
      captured = cb;
    },
  } as unknown as McpServer;

  registerGetFindingsTool(server, new ReviewService(api, CONFIG, async () => {}));
  if (!captured) throw new Error('get_findings did not register a handler');
  return captured;
}

/** The SDK applies the zod defaults before the handler runs; here we pass them in. */
const args = (over: Partial<Args> = {}): Args => ({
  repo: 'acme/payments-api',
  pr: 482,
  detail: 'concise',
  limit: 20,
  ...over,
});

describe('get_findings — read-only, never starts a review (§5.3)', () => {
  beforeEach(() => vi.clearAllMocks());

  it('defaults to the latest completed review, and ignores the `kind: "summary"` row', async () => {
    const api = mockApi();
    const result = await handlerFor(api)(args());

    // Never bills. The whole disambiguator against run_agent_on_pr is that it costs nothing.
    expect(api.startReview).not.toHaveBeenCalled();

    expect(result.isError).toBeUndefined();
    expect(result.structuredContent).toMatchObject({
      run_id: RUN_NEW,
      verdict: 'request_changes',
      summary: 'Newest review.',
      total_findings: 3,
    });
    expect(result.content[0]?.text).not.toContain('{"');
  });

  it('selects a specific run when `run_id` is given', async () => {
    const api = mockApi();
    const result = await handlerFor(api)(args({ run_id: RUN_OLD }));

    expect(result.structuredContent).toMatchObject({
      run_id: RUN_OLD,
      verdict: 'approve',
      summary: 'Older review.',
      total_findings: 0,
    });
  });

  it('detail:"concise" omits rationale and suggestion; detail:"full" adds them', async () => {
    const api = mockApi();

    const concise = await handlerFor(api)(args({ detail: 'concise' }));
    const conciseFindings = concise.structuredContent?.findings as Record<string, unknown>[];
    expect(conciseFindings[0]).toEqual({
      severity: 'WARNING',
      category: 'bug',
      title: 'Issue 1',
      file: 'src/file-1.ts',
      lines: '1',
    });
    expect(concise.content[0]?.text).not.toContain('RATIONALE-1');

    const full = await handlerFor(api)(args({ detail: 'full' }));
    const fullFindings = full.structuredContent?.findings as Record<string, unknown>[];
    expect(fullFindings[0]).toMatchObject({
      rationale: 'RATIONALE-1 — the unbounded markdown blob.',
      suggestion: 'SUGGESTION-1',
      confidence: 0.7,
    });
  });

  it('truncates to `limit` and emits the "N more" hint naming get_findings', async () => {
    const api = mockApi();
    const result = await handlerFor(api)(args({ limit: 1 }));

    expect(result.structuredContent?.findings).toHaveLength(1);
    expect(result.structuredContent).toMatchObject({ total_findings: 3 });
    expect(result.structuredContent?.next).toBe(
      'Showing 1 of 3 findings. Call get_findings again with limit=3 for the rest.',
    );
    expect(result.content[0]?.text).toContain('Showing 1 of 3 findings');
  });

  it('emits no hint when nothing was dropped', async () => {
    const api = mockApi();
    const result = await handlerFor(api)(args({ limit: 20 }));

    expect(result.structuredContent?.next).toBeNull();
  });

  it('no review yet → points at run_agent_on_pr', async () => {
    const api = mockApi({ listReviews: vi.fn(async () => [summary()]) });
    const result = await handlerFor(api)(args());

    expect(result.isError).toBe(true);
    expect(result.content[0]?.text).toContain('has no completed review yet');
    expect(result.content[0]?.text).toContain('run_agent_on_pr');
    expect(api.startReview).not.toHaveBeenCalled();
  });

  it('a run_id that is still running does NOT invite a second billable review', async () => {
    // The caller got this run_id from a run_agent_on_pr that timed out. Answering "no
    // review yet — call run_agent_on_pr" here would charge for the same review twice.
    const api = mockApi({
      listReviews: vi.fn(async () => []),
      listRuns: vi.fn(async () => [runSummary({ status: 'running' })]),
    });
    const result = await handlerFor(api)(args({ run_id: RUN_NEW }));

    expect(result.isError).toBe(true);
    expect(result.content[0]?.text).toContain('Do NOT call run_agent_on_pr again');
    expect(result.content[0]?.text).toContain(RUN_NEW);

    // It must be the READ-path message, not the write path's timeout message: this run
    // may have started seconds ago, so an "after 180s" claim would be false. Both carry
    // the money guarantee, so only the absent time-claim distinguishes them.
    expect(result.content[0]?.text).not.toMatch(/after \d+s/);
  });

  it('a run_id that failed reports the failure, not "no review yet"', async () => {
    const api = mockApi({
      listReviews: vi.fn(async () => []),
      listRuns: vi.fn(async () => [runSummary({ status: 'failed', error: 'provider 401' })]),
    });
    const result = await handlerFor(api)(args({ run_id: RUN_NEW }));

    expect(result.isError).toBe(true);
    expect(result.content[0]?.text).toContain('provider 401');
  });
});
