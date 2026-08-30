import type { Finding, EvalExpectedFinding, LLMProvider, UnifiedDiff } from '@devdigest/shared';
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

/**
 * Parse the case's stored diff into files+hunks. GitHub's `PrFile.patch` is HEADERLESS
 * (starts at `@@`, no `+++ b/<path>`), and `parseUnifiedDiff` attributes hunks to a file
 * only via that header — so a case seeded from a raw patch parses to ZERO files, the agent
 * reviews an empty diff, and every `must_find` case fails (every `must_not_flag` trivially
 * passes). New cases are fixed at authoring (the client seeds a header-complete diff); this
 * rescues cases ALREADY saved with a headerless `input_diff` by re-attaching git headers from
 * the stored `input_files` paths. Guarded: only runs when the primary parse found no files, so
 * a well-formed diff is never touched.
 */
export function parseCaseDiff(inputDiff: string, inputFiles: unknown): UnifiedDiff {
  const parsed = parseUnifiedDiff(inputDiff);
  if (parsed.files.length > 0) return parsed;

  const files = Array.isArray(inputFiles) ? inputFiles : [];
  const rebuilt = files
    .map((f) => (f && typeof f === 'object' ? (f as { path?: unknown; patch?: unknown }) : {}))
    .filter(
      (f): f is { path: string; patch: string } =>
        typeof f.path === 'string' && typeof f.patch === 'string' && f.patch.trim().length > 0,
    )
    .map((f) => `diff --git a/${f.path} b/${f.path}\n--- a/${f.path}\n+++ b/${f.path}\n${f.patch}`)
    .join('\n');

  return rebuilt ? parseUnifiedDiff(rebuilt) : parsed;
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
    const diff = parseCaseDiff(caseRow.inputDiff ?? '', caseRow.inputFiles);
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
