/**
 * Unit tests for the deterministic, ZERO-LLM eval scorer (WP-B).
 *
 * There is deliberately NO `LLMProvider` (nor any provider adapter) imported
 * anywhere in this file — that structural absence is the unit-level proof of
 * AC-6 (scoring adds zero model calls). The scorer is exercised purely on
 * plain data: expectations + already-grounded findings + a produced count.
 */
import { describe, it, expect } from 'vitest';
import type { Finding, EvalExpectedFinding } from '@devdigest/shared';
import { match, scoreCase, scoreBatch } from '../src/eval/score.js';

/** Build a minimal valid `Finding`; only file/lines/kind matter to the scorer. */
function mkFinding(
  file: string,
  start: number,
  end: number,
  kind?: Finding['kind'],
): Finding {
  return {
    id: `f-${file}-${start}-${end}`,
    severity: 'warning',
    category: 'bug',
    title: 'x',
    file,
    start_line: start,
    end_line: end,
    rationale: 'x',
    confidence: 0.9,
    ...(kind ? { kind } : {}),
  };
}

const mustFind = (file: string, start: number, end: number): EvalExpectedFinding => ({
  kind: 'must_find',
  file,
  start_line: start,
  end_line: end,
});

const mustNotFlag = (file: string, start: number, end: number): EvalExpectedFinding => ({
  kind: 'must_not_flag',
  file,
  start_line: start,
  end_line: end,
});

describe('match(f, e) — AC-7', () => {
  it('same file + overlapping closed ranges → true', () => {
    expect(match(mkFinding('a.ts', 10, 20), mustFind('a.ts', 15, 25))).toBe(true);
  });

  it('same file + disjoint ranges → false', () => {
    expect(match(mkFinding('a.ts', 10, 12), mustFind('a.ts', 30, 40))).toBe(false);
  });

  it('different file → false (even with overlapping lines)', () => {
    expect(match(mkFinding('a.ts', 10, 20), mustFind('b.ts', 10, 20))).toBe(false);
  });

  it('full-file kind + same file → true even when line ranges are disjoint', () => {
    for (const kind of ['secret_leak', 'lethal_trifecta', 'phantom', 'hook'] as const) {
      expect(match(mkFinding('a.ts', 1, 1, kind), mustFind('a.ts', 500, 600))).toBe(true);
    }
  });

  it('full-file kind on a DIFFERENT file → still false (file gate wins)', () => {
    expect(match(mkFinding('a.ts', 1, 1, 'secret_leak'), mustFind('b.ts', 1, 1))).toBe(false);
  });

  it('touching endpoints count as overlap (closed intervals)', () => {
    expect(match(mkFinding('a.ts', 10, 15), mustFind('a.ts', 15, 20))).toBe(true);
  });
});

describe('scoreCase recall — AC-8', () => {
  it('2 must_find, 1 matched → recall 0.5', () => {
    const expectations = [mustFind('a.ts', 10, 12), mustFind('b.ts', 5, 6)];
    const grounded = [mkFinding('a.ts', 11, 11)]; // matches only the first
    const score = scoreCase(expectations, grounded, 1);
    expect(score.recall).toBe(0.5);
    expect(score.counts.mustFind).toBe(2);
    expect(score.counts.mustFindMatched).toBe(1);
  });

  it('pure must_not_flag case (no must_find), clean run → recall 1', () => {
    const score = scoreCase([mustNotFlag('a.ts', 10, 12)], [], 0);
    expect(score.recall).toBe(1);
  });
});

describe('scoreCase precision — AC-9', () => {
  it('must_not_flag case, a finding on the forbidden region → precision < 1', () => {
    const score = scoreCase([mustNotFlag('a.ts', 10, 20)], [mkFinding('a.ts', 15, 16)], 1);
    expect(score.precision).toBeLessThan(1);
    expect(score.precision).toBe(0); // one grounded finding, all FP
    expect(score.counts.forbiddenHits).toBe(1);
    expect(score.counts.fp).toBe(1);
    expect(score.counts.tp).toBe(0);
  });

  it('must_not_flag case, clean run → precision 1 (0 grounded guarded to 1)', () => {
    const score = scoreCase([mustNotFlag('a.ts', 10, 20)], [], 0);
    expect(score.precision).toBe(1);
  });

  it('must_find case, a grounded finding matching no expectation → precision < 1', () => {
    const expectations = [mustFind('a.ts', 10, 12)];
    const grounded = [mkFinding('a.ts', 11, 11), mkFinding('z.ts', 99, 99)]; // 1 TP, 1 stray FP
    const score = scoreCase(expectations, grounded, 2);
    expect(score.precision).toBe(0.5);
    expect(score.counts.tp).toBe(1);
    expect(score.counts.fp).toBe(1);
  });
});

describe('scoreCase citationAccuracy — AC-10', () => {
  it('engine kept 3 of 4 findings → citation 0.75', () => {
    const grounded = [
      mkFinding('a.ts', 1, 1),
      mkFinding('a.ts', 2, 2),
      mkFinding('a.ts', 3, 3),
    ];
    const score = scoreCase([], grounded, 4); // produced 4, kept 3
    expect(score.citationAccuracy).toBe(0.75);
  });

  it('nothing produced → citation 1 (guarded)', () => {
    expect(scoreCase([], [], 0).citationAccuracy).toBe(1);
  });
});

describe('scoreCase pass truth table — AC-11', () => {
  it('all must_find matched + no forbidden hit → pass true', () => {
    const score = scoreCase([mustFind('a.ts', 10, 12)], [mkFinding('a.ts', 11, 11)], 1);
    expect(score.pass).toBe(true);
  });

  it('a must_find missing → pass false', () => {
    const score = scoreCase([mustFind('a.ts', 10, 12)], [], 0);
    expect(score.pass).toBe(false);
  });

  it('must_not_flag violated → pass false (even though recall is 1)', () => {
    const score = scoreCase([mustNotFlag('a.ts', 10, 20)], [mkFinding('a.ts', 15, 16)], 1);
    expect(score.recall).toBe(1);
    expect(score.pass).toBe(false);
  });

  it('mixed case: must_find matched AND must_not_flag respected → pass true', () => {
    const expectations = [mustFind('a.ts', 10, 12), mustNotFlag('secrets.ts', 1, 100)];
    const grounded = [mkFinding('a.ts', 11, 11)]; // hits the must_find, avoids the forbidden file
    const score = scoreCase(expectations, grounded, 1);
    expect(score.pass).toBe(true);
  });
});

describe('scoreBatch micro-average', () => {
  it('micro-averages recall/precision/citation across cases and reports pass_rate', () => {
    const cases = [
      // case 1: 1 must_find matched, 1 grounded (TP), produced 1 → pass
      {
        name: 'c1',
        expectations: [mustFind('a.ts', 10, 12)],
        grounded: [mkFinding('a.ts', 11, 11)],
        producedCount: 1,
      },
      // case 2: 1 must_find UNmatched, 0 grounded, produced 0 → fail
      {
        name: 'c2',
        expectations: [mustFind('b.ts', 5, 6)],
        grounded: [] as Finding[],
        producedCount: 0,
      },
    ];
    const batch = scoreBatch(cases);
    // recall micro = 1 matched / 2 total must_find = 0.5
    expect(batch.recall).toBe(0.5);
    // precision micro = 1 TP / 1 grounded = 1
    expect(batch.precision).toBe(1);
    // citation micro = 1 grounded / 1 produced = 1
    expect(batch.citation_accuracy).toBe(1);
    expect(batch.traces_total).toBe(2);
    expect(batch.traces_passed).toBe(1);
    expect(batch.pass_rate).toBe(0.5);
    expect(batch.per_trace.map((t) => t.pass)).toEqual([true, false]);
    expect(batch.per_trace.map((t) => t.name)).toEqual(['c1', 'c2']);
  });

  it('empty batch → guarded metrics (all 1, pass_rate 1, no traces)', () => {
    const batch = scoreBatch([]);
    expect(batch).toMatchObject({
      recall: 1,
      precision: 1,
      citation_accuracy: 1,
      pass_rate: 1,
      traces_passed: 0,
      traces_total: 0,
    });
    expect(batch.per_trace).toEqual([]);
  });
});
