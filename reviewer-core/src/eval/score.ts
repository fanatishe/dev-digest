/**
 * Deterministic, ZERO-LLM eval scorer (pure core).
 *
 * Given a set of expectations (authored by a reviewer), the engine's grounded
 * survivors for a case, and the count of findings the model produced BEFORE
 * grounding, this module computes recall / precision / citation-accuracy / pass
 * for a case and micro-averages them across a batch.
 *
 * Purity is the contract: these functions take NO `LLMProvider` (and import
 * none) — zero-LLM is structural, not a runtime check. They read only grounded
 * findings + validated expectations; they never re-ground, never parse
 * untrusted content, and never restate or weaken the engine's grounding gate
 * (`grounding.ts`) or `INJECTION_GUARD`. The full-file-kind set and the
 * closed-range overlap rule below MIRROR `grounding.ts` deliberately — the pure
 * core must not import server code, so the concept is reproduced locally.
 */
import type { Finding, EvalExpectedFinding, EvalPerTrace } from '@devdigest/shared';

/**
 * Finding kinds that are not tied to a specific diff hunk (full-file scanners).
 * Mirrors `FULL_FILE_KINDS` in `grounding.ts`: such a produced finding matches
 * an expectation on the same file regardless of line ranges.
 */
const FULL_FILE_KINDS = new Set(['secret_leak', 'lethal_trifecta', 'phantom', 'hook']);

/** True iff the two closed intervals [a1,a2] and [b1,b2] intersect. */
function rangesOverlap(a1: number, a2: number, b1: number, b2: number): boolean {
  const aLo = Math.min(a1, a2);
  const aHi = Math.max(a1, a2);
  const bLo = Math.min(b1, b2);
  const bHi = Math.max(b1, b2);
  return aLo <= bHi && bLo <= aHi;
}

/**
 * Does a produced finding `f` match an expectation `e`?
 *
 * Same file is required. A full-file-kind finding (`secret_leak`,
 * `lethal_trifecta`, `phantom`, `hook`) matches on file alone; any other
 * finding additionally requires its `[start_line, end_line]` closed range to
 * intersect the expectation's closed range.
 */
export function match(f: Finding, e: EvalExpectedFinding): boolean {
  if (f.file !== e.file) return false;
  const isFullFile = f.kind ? FULL_FILE_KINDS.has(f.kind) : false;
  if (isFullFile) return true;
  return rangesOverlap(f.start_line, f.end_line, e.start_line, e.end_line);
}

/** Explicit tallies behind a case's metrics — kept public so tests read them directly. */
export interface CaseScoreCounts {
  /** Total `must_find` expectations. */
  mustFind: number;
  /** `must_find` expectations matched by at least one grounded finding. */
  mustFindMatched: number;
  /** Total `must_not_flag` expectations. */
  mustNotFlag: number;
  /** Grounded findings landing on a forbidden (`must_not_flag`) region. */
  forbiddenHits: number;
  /** True positives: grounded findings matching a `must_find` and no forbidden region. */
  tp: number;
  /** False positives: forbidden-region hits + grounded findings matching no expectation. */
  fp: number;
  /** Grounded (post-grounding) findings for this case. */
  grounded: number;
  /** Findings the model produced BEFORE grounding (grounded + dropped). */
  produced: number;
}

/** The score of a single eval case. */
export interface CaseScore {
  /** matched `must_find` / total `must_find`; `1` when the case has no `must_find`. */
  recall: number;
  /** TP / (TP + FP); `1` when nothing was produced. */
  precision: number;
  /** grounded / produced; `1` when nothing was produced. */
  citationAccuracy: number;
  /** True iff no `must_find` is missing AND nothing landed on a forbidden region. */
  pass: boolean;
  counts: CaseScoreCounts;
}

/**
 * Score one case deterministically.
 *
 * @param expectations the case's `EvalExpectedOutput.expectations`
 * @param grounded     the engine's grounded survivors (`ReviewOutcome.review.findings`)
 * @param producedCount findings produced before grounding (`grounded.length + dropped.length`)
 */
export function scoreCase(
  expectations: readonly EvalExpectedFinding[],
  grounded: readonly Finding[],
  producedCount: number,
): CaseScore {
  const mustFind = expectations.filter((e) => e.kind === 'must_find');
  const mustNotFlag = expectations.filter((e) => e.kind === 'must_not_flag');

  // recall (AC-8): matched must_find / total must_find; default 1 when none.
  const mustFindMatched = mustFind.filter((e) => grounded.some((f) => match(f, e))).length;
  const recall = mustFind.length === 0 ? 1 : mustFindMatched / mustFind.length;

  // precision (AC-9): classify every grounded finding as TP or FP.
  //  - lands on a forbidden (must_not_flag) region  → FP (and a forbidden hit)
  //  - else matches a must_find expectation         → TP
  //  - else matches no expectation                  → FP
  let tp = 0;
  let fp = 0;
  let forbiddenHits = 0;
  for (const f of grounded) {
    const hitsForbidden = mustNotFlag.some((e) => match(f, e));
    if (hitsForbidden) {
      fp += 1;
      forbiddenHits += 1;
      continue;
    }
    if (mustFind.some((e) => match(f, e))) {
      tp += 1;
    } else {
      fp += 1;
    }
  }
  const precision = grounded.length === 0 ? 1 : tp / grounded.length;

  // citation accuracy (AC-10): grounded / produced; guard produced === 0.
  const citationAccuracy = producedCount === 0 ? 1 : grounded.length / producedCount;

  // pass (AC-11): every must_find matched AND no forbidden region violated.
  const pass = mustFindMatched === mustFind.length && forbiddenHits === 0;

  return {
    recall,
    precision,
    citationAccuracy,
    pass,
    counts: {
      mustFind: mustFind.length,
      mustFindMatched,
      mustNotFlag: mustNotFlag.length,
      forbiddenHits,
      tp,
      fp,
      grounded: grounded.length,
      produced: producedCount,
    },
  };
}

/** One case fed to `scoreBatch`: its name plus everything `scoreCase` needs. */
export interface BatchCase {
  name: string;
  expectations: readonly EvalExpectedFinding[];
  grounded: readonly Finding[];
  producedCount: number;
}

/**
 * Micro-averaged batch metrics, mapping 1:1 onto the `EvalRun` contract and the
 * `eval_batches` columns. `cost_usd` and `duration_ms` are summed by the service
 * (WP-C), NOT here — this function is pure scoring only.
 */
export interface BatchScore {
  recall: number;
  precision: number;
  citation_accuracy: number;
  pass_rate: number;
  traces_passed: number;
  traces_total: number;
  per_trace: EvalPerTrace[];
}

/**
 * Score a batch by micro-averaging the underlying tallies across cases (not by
 * averaging per-case ratios): recall = Σ matched / Σ must_find, precision =
 * Σ TP / Σ grounded, citation = Σ grounded / Σ produced. `traces_passed` counts
 * passing cases; `pass_rate = traces_passed / traces_total`.
 */
export function scoreBatch(cases: readonly BatchCase[]): BatchScore {
  let sumMustFind = 0;
  let sumMustFindMatched = 0;
  let sumTp = 0;
  let sumGrounded = 0;
  let sumProduced = 0;
  let tracesPassed = 0;
  const perTrace: EvalPerTrace[] = [];

  for (const c of cases) {
    const score = scoreCase(c.expectations, c.grounded, c.producedCount);
    sumMustFind += score.counts.mustFind;
    sumMustFindMatched += score.counts.mustFindMatched;
    sumTp += score.counts.tp;
    sumGrounded += score.counts.grounded;
    sumProduced += score.counts.produced;
    if (score.pass) tracesPassed += 1;
    perTrace.push({
      name: c.name,
      pass: score.pass,
      expected: c.expectations,
      actual: c.grounded,
    });
  }

  const tracesTotal = cases.length;
  return {
    recall: sumMustFind === 0 ? 1 : sumMustFindMatched / sumMustFind,
    precision: sumGrounded === 0 ? 1 : sumTp / sumGrounded,
    citation_accuracy: sumProduced === 0 ? 1 : sumGrounded / sumProduced,
    pass_rate: tracesTotal === 0 ? 1 : tracesPassed / tracesTotal,
    traces_passed: tracesPassed,
    traces_total: tracesTotal,
    per_trace: perTrace,
  };
}
