import type { Finding, EvalExpectedFinding, LLMProvider } from '@devdigest/shared';
import { reviewPullRequest, scoreCase, type CaseScore } from '@devdigest/reviewer-core';
import { parseUnifiedDiff } from '../../adapters/git/diff-parser.js';
import type { EvalCaseRow } from './repository.js';
import { assembleEvalReviewInput, parseExpectations, type EvalRunConfig } from './helpers.js';

/**
 * Eval run-executor (app ring) — one review per case, then DETERMINISTIC scoring.
 *
 * The single LLM call in the whole pipeline happens here, in `reviewPullRequest`;
 * `scoreCase` that follows is ZERO-LLM (pure `reviewer-core`). The review input is
 * built hermetically (`assembleEvalReviewInput`): repo-intel OFF, no callers /
 * repoMap / intent / prDescription (AC-25). The executor holds NO DB and reaches
 * NO other module — it takes a resolved config + case row + provider and returns
 * data; the service owns resolution + persistence.
 */

export interface EvalCaseExecution {
  /** The deterministic per-case score (recall/precision/citation/pass). */
  score: CaseScore;
  /** Engine's grounded survivors — the `actual` shown in the run record. */
  grounded: readonly Finding[];
  /** Findings produced BEFORE grounding (grounded + dropped) — the citation denominator. */
  producedCount: number;
  /** Wall-clock of the single review. */
  durationMs: number;
  /** Provider-reported cost (null when unreported). */
  costUsd: number | null;
  /** The validated expectations the case was scored against (fed to `scoreBatch`). */
  expectations: EvalExpectedFinding[];
}

export class EvalRunExecutor {
  /**
   * Execute one eval case: parse its fixed diff, assemble a hermetic ReviewInput,
   * run the engine ONCE, and score the grounded survivors. No persistence here.
   */
  async runCase(
    config: EvalRunConfig,
    caseRow: EvalCaseRow,
    llm: LLMProvider,
  ): Promise<EvalCaseExecution> {
    const diff = parseUnifiedDiff(caseRow.inputDiff ?? '');
    const expectations = parseExpectations(caseRow.expectedOutput);

    const input = assembleEvalReviewInput(config, diff, llm);
    const start = Date.now();
    const outcome = await reviewPullRequest(input);
    const durationMs = Date.now() - start;

    const grounded = outcome.review.findings;
    // citation denominator (AC-10): everything the model produced pre-grounding.
    const producedCount = outcome.review.findings.length + outcome.dropped.length;
    const score = scoreCase(expectations, grounded, producedCount);

    return {
      score,
      grounded,
      producedCount,
      durationMs,
      costUsd: outcome.costUsd,
      expectations,
    };
  }
}
