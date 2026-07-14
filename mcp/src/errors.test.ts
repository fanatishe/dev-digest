import { describe, expect, it } from 'vitest';
import {
  ApiError,
  ApiUnreachableError,
  NOT_IMPLEMENTED_BLAST,
  ToolError,
  agentNotFoundMessage,
  apiDownMessage,
  apiErrorMessage,
  noAgentsMessage,
  noCompletedReviewMessage,
  noConventionsMessage,
  prNotFoundMessage,
  prNotSyncedMessage,
  rateLimitedMessage,
  repoNotFoundMessage,
  runFailedMessage,
  runStillRunningMessage,
  runTimeoutMessage,
  toToolError,
} from './errors.js';

const BASE = 'http://localhost:3001';

/** Principle 4: every error names the next tool to call or the next command to run. */
const LEADS_ONWARD = /list_agents|get_findings|run_agent_on_pr|get_conventions|dev\.sh|DevDigest UI/;

const CATALOGUE: Record<string, string> = {
  apiDown: apiDownMessage(BASE),
  repoNotFound: repoNotFoundMessage('acme/x', ['acme/payments-api']),
  repoNotFoundEmpty: repoNotFoundMessage('acme/x', []),
  prNotFound: prNotFoundMessage(999, 'acme/payments-api', [482, 479]),
  prNotFoundEmpty: prNotFoundMessage(999, 'acme/payments-api', []),
  prNotSynced: prNotSyncedMessage(482, 'acme/payments-api'),
  agentNotFound: agentNotFoundMessage('secuirty'),
  noAgents: noAgentsMessage(),
  rateLimited: rateLimitedMessage(),
  noCompletedReview: noCompletedReviewMessage(482, 'acme/payments-api'),
  noConventions: noConventionsMessage('acme/payments-api'),
  runTimeout: runTimeoutMessage('run-1', 'acme/payments-api', 482, 180_000),
  runStillRunning: runStillRunningMessage('run-1', 'acme/payments-api', 482),
  runFailed: runFailedMessage('run-1', 'failed', 'provider 429'),
  apiError500: apiErrorMessage(new ApiError(500, 'internal_error', 'boom'), BASE),
  apiError429: apiErrorMessage(new ApiError(429, 'rate_limited', 'slow down'), BASE),
  notImplementedBlast: NOT_IMPLEMENTED_BLAST,
};

describe('the error catalogue leads onward (P4)', () => {
  it.each(Object.entries(CATALOGUE))('%s names a next tool or command', (_name, message) => {
    expect(message).toMatch(LEADS_ONWARD);
    expect(message.length).toBeGreaterThan(20);
  });

  it('never leaks a bare status code with no next step', () => {
    for (const message of Object.values(CATALOGUE)) {
      expect(message).not.toMatch(/^\s*(404|500|422|429)\s*$/);
    }
  });
});

describe('the individual messages', () => {
  it('the API-down message names the command that starts the stack', () => {
    expect(apiDownMessage(BASE)).toContain('./scripts/dev.sh');
    expect(apiDownMessage(BASE)).toContain(BASE);
  });

  it('repo-not-found enumerates what IS imported (so the model can self-correct)', () => {
    expect(repoNotFoundMessage('acme/x', ['a/b', 'c/d'])).toContain('a/b, c/d');
  });

  it('pr-not-found enumerates the open PR numbers', () => {
    expect(prNotFoundMessage(999, 'acme/payments-api', [482, 479])).toContain('#482, #479');
  });

  it('a 429 maps to the rate-limit message, which offers the free read instead', () => {
    expect(CATALOGUE.apiError429).toBe(rateLimitedMessage());
    expect(rateLimitedMessage()).toContain('get_findings');
  });

  it('the timeout message forbids a retry — a retry is a second bill', () => {
    const message = runTimeoutMessage('run-1', 'acme/payments-api', 482, 180_000);
    expect(message).toContain('Do NOT call run_agent_on_pr again');
    expect(message).toContain('180s');
    expect(message).toContain('get_findings');
    expect(message).toContain('run_id:"run-1"');
  });

  it('the still-running message carries the same money guarantee, minus the time claim', () => {
    const message = runStillRunningMessage('run-1', 'acme/payments-api', 482);

    // Reached from a READ path (get_findings with a run_id whose review has not landed).
    // The obvious fallback — "no review yet, call run_agent_on_pr" — would REVERSE the
    // guardrail the timeout path just issued and bill the same review twice.
    expect(message).toContain('Do NOT call run_agent_on_pr again');
    expect(message).toContain('already paid for');
    expect(message).toContain('get_findings');
    expect(message).toContain('run_id:"run-1"');

    // ...and unlike runTimeoutMessage it asserts no elapsed time: the caller may be
    // asking seconds after the run started, so "still running after 180s" would be a lie.
    expect(message).not.toMatch(/\d+s\b/);
  });

  it('the blast-radius message states the exercise and offers the fallback tool', () => {
    expect(NOT_IMPLEMENTED_BLAST).toContain('get_findings');
    expect(NOT_IMPLEMENTED_BLAST).toContain('ApiPort');
    expect(NOT_IMPLEMENTED_BLAST).toMatch(/route/i);
  });
});

describe('toToolError', () => {
  it('turns an unreachable API into the "start it with ./scripts/dev.sh" message', () => {
    const err = toToolError(new ApiUnreachableError(BASE), BASE);
    expect(err).toBeInstanceOf(ToolError);
    expect(err.message).toBe(apiDownMessage(BASE));
  });

  it('passes a ToolError through untouched (it is already written for the model)', () => {
    const original = new ToolError(agentNotFoundMessage('ghost'));
    expect(toToolError(original, BASE)).toBe(original);
  });

  it('decodes an ApiError, and still names a next step for an unknown throw', () => {
    expect(toToolError(new ApiError(422, 'bad_request', 'nope'), BASE).message).toMatch(/422/);
    expect(toToolError(new Error('kaboom'), BASE).message).toMatch(LEADS_ONWARD);
    expect(toToolError('kaboom', BASE).message).toMatch(LEADS_ONWARD);
  });
});
