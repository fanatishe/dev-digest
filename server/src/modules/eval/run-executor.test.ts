import { describe, it, expect } from 'vitest';
import type { Review } from '@devdigest/shared';
import { parseUnifiedDiff } from '../../adapters/git/diff-parser.js';
import { MockLLMProvider } from '../../adapters/mocks.js';
import { assembleEvalReviewInput, type EvalRunConfig } from './helpers.js';
import { EvalRunExecutor } from './run-executor.js';
import { EVAL_SKILL_HOST_PROMPT } from './constants.js';
import type { EvalCaseRow } from './repository.js';

/**
 * Unit — the eval run-executor + its hermetic input builder. No DB, no network:
 * a `MockLLMProvider` stands in for the one review call, and the scorer is pure.
 * Covers AC-25 (repo-intel OFF structurally) and AC-19 (skill host assembly).
 */

// A diff whose hunk covers new-side lines 10–12 of src/config.ts.
const DIFF_RAW = [
  'diff --git a/src/config.ts b/src/config.ts',
  '--- a/src/config.ts',
  '+++ b/src/config.ts',
  '@@ -10,3 +10,4 @@',
  '   port: 3000,',
  '+  stripeKey: "sk_live_xxx",',
  '   redisUrl: x,',
].join('\n');

const REVIEW_FIXTURE: Review = {
  verdict: 'request_changes',
  summary: 'Hardcoded secret introduced.',
  score: 20,
  findings: [
    {
      id: 'f1',
      severity: 'CRITICAL',
      category: 'security',
      title: 'Hardcoded Stripe key',
      file: 'src/config.ts',
      start_line: 11,
      end_line: 11,
      rationale: 'A live secret is committed to config.',
      confidence: 0.95,
    },
  ],
};

function caseRow(over: Partial<EvalCaseRow> = {}): EvalCaseRow {
  return {
    id: 'c1',
    workspaceId: 'w1',
    ownerKind: 'agent',
    ownerId: 'a1',
    name: 'secret in config',
    inputDiff: DIFF_RAW,
    inputFiles: null,
    inputMeta: null,
    expectedOutput: {
      expectations: [
        { kind: 'must_find', file: 'src/config.ts', start_line: 11, end_line: 11 },
      ],
    },
    notes: null,
    ...over,
  } as EvalCaseRow;
}

describe('assembleEvalReviewInput (hermetic — AC-25)', () => {
  const diff = parseUnifiedDiff(DIFF_RAW);
  const llm = new MockLLMProvider('openai', { structured: REVIEW_FIXTURE });

  it('carries NO callers / repoMap / intent / prDescription / memory / specs', () => {
    const config: EvalRunConfig = {
      systemPrompt: 'Agent prompt',
      model: 'gpt-4.1',
      skills: [],
      agentVersion: 3,
    };
    const input = assembleEvalReviewInput(config, diff, llm);

    // Structural proof (not a substring): none of the repo-intel enrichment keys
    // are present — that ABSENCE is repo_intel OFF.
    for (const key of ['callers', 'repoMap', 'intent', 'prDescription', 'memory', 'specs']) {
      expect(key in input).toBe(false);
    }
    expect(input.strategy).toBe('single-pass');
    expect(input.systemPrompt).toBe('Agent prompt');
    expect('skills' in input).toBe(false); // empty skill set → section omitted
  });

  it('a skill run uses EVAL_SKILL_HOST_PROMPT + exactly [skill.body] and pins skill.version (AC-19)', () => {
    const config: EvalRunConfig = {
      systemPrompt: EVAL_SKILL_HOST_PROMPT,
      model: 'deepseek/deepseek-v4-flash',
      skills: ['## Rubric\nReject hardcoded secrets.'],
      agentVersion: 7, // the skill's version
    };
    const input = assembleEvalReviewInput(config, diff, llm);

    expect(input.systemPrompt).toBe(EVAL_SKILL_HOST_PROMPT);
    expect(input.skills).toEqual(['## Rubric\nReject hardcoded secrets.']);
    expect(config.agentVersion).toBe(7);
    // still hermetic on the skill path
    expect('intent' in input).toBe(false);
  });
});

describe('EvalRunExecutor.runCase', () => {
  it('runs exactly one review and scores the grounded survivors', async () => {
    const llm = new MockLLMProvider('openai', { structured: REVIEW_FIXTURE });
    const exec = new EvalRunExecutor();
    const config: EvalRunConfig = {
      systemPrompt: 'Agent prompt',
      model: 'gpt-4.1',
      skills: [],
      agentVersion: 1,
    };

    const result = await exec.runCase(config, caseRow(), llm);

    // exactly one model call for the case (the AC-6 invariant, at unit scope).
    expect(llm.calls.filter((c) => c.method === 'completeStructured')).toHaveLength(1);
    // the must_find on src/config.ts:11 is matched by the grounded finding.
    expect(result.score.recall).toBe(1);
    expect(result.score.pass).toBe(true);
    expect(result.grounded).toHaveLength(1);
    expect(result.producedCount).toBe(1);
  });
});
