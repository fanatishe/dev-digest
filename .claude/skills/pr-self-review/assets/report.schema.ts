/**
 * pr-self-review report contract — a thin reference over DevDigest's own findings
 * schema so the JSON that `self-review.mjs gate` writes stays in lockstep with the
 * product. The canonical source is:
 *
 *   server/src/vendor/shared/contracts/findings.ts   (exported as `@devdigest/shared`)
 *
 * Inside `server`/`client` you can import the real Zod schemas via the alias and
 * validate a report with `Review.parse(json)`:
 *
 *   import { Review } from '@devdigest/shared';
 *   Review.parse(JSON.parse(readFileSync('.devdigest/cache/self-review.json','utf8')));
 *
 * The mirrors below exist only so this skill folder is self-describing; they must
 * match the source enums exactly. If the contract changes, update both.
 */

/** Severity — matches contracts/findings.ts `Severity`. */
export type Severity = 'CRITICAL' | 'WARNING' | 'SUGGESTION';

/** Verdict — matches contracts/findings.ts `Verdict`. `request_changes` == BLOCK. */
export type Verdict = 'request_changes' | 'approve' | 'comment';

export type FindingCategory = 'bug' | 'security' | 'perf' | 'style' | 'test';
export type FindingKind = 'finding' | 'secret_leak' | 'lethal_trifecta' | 'phantom' | 'hook';

/** Finding — subset/shape emitted by the gate; a superset-compatible `Finding`. */
export interface SelfReviewFinding {
  id: string;
  severity: Severity;
  category: FindingCategory;
  title: string;
  file: string;
  start_line: number;
  end_line: number;
  rationale: string;
  suggestion?: string | null;
  confidence: number; // 0..1 ; >= 0.8 is "high confidence" and can BLOCK
  kind?: FindingKind | null;
}

/** Review — the object written to `.devdigest/cache/self-review.json`. */
export interface SelfReviewReport {
  verdict: Verdict;
  summary: string;
  score: number; // 0..100, higher is better
  findings: SelfReviewFinding[];
}

/** The gate blocks (exit 1, verdict `request_changes`) iff this is true for any finding. */
export const isBlocking = (f: SelfReviewFinding): boolean =>
  f.severity === 'CRITICAL' && f.confidence >= 0.8;
