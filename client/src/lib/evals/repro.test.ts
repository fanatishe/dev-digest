import { describe, it, expect } from "vitest";
import type { EvalRunRecord } from "@devdigest/shared";
import { reproRate } from "./repro";

/** Build an EvalRunRecord with only `pass` mattering to the rate. */
const run = (pass: boolean | null, i = 0): EvalRunRecord => ({
  id: `run-${i}`,
  case_id: "case-1",
  ran_at: "2026-07-19T00:00:00.000Z",
  actual_output: null,
  pass,
  recall: null,
  precision: null,
  citation_accuracy: null,
  duration_ms: null,
  cost_usd: null,
});

/** `n` passing + `total - n` failing runs, newest-first. */
const runs = (n: number, total: number): EvalRunRecord[] =>
  Array.from({ length: total }, (_, i) => run(i < n, i));

describe("reproRate", () => {
  it("marks 5/5 and 4/5 reliable, 2/5 not reliable (AC-14)", () => {
    expect(reproRate(runs(5, 5))).toEqual({
      passed: 5,
      total: 5,
      ratio: 1,
      reliable: true,
    });
    expect(reproRate(runs(4, 5))).toEqual({
      passed: 4,
      total: 5,
      ratio: 0.8,
      reliable: true,
    });

    const flaky = reproRate(runs(2, 5));
    expect(flaky.passed).toBe(2);
    expect(flaky.total).toBe(5);
    expect(flaky.reliable).toBe(false);
  });

  it("counts only the last `window` runs and ignores not-yet-scored (null) runs", () => {
    // 8 runs supplied, window 5 → only the newest 5 counted.
    const history = [...runs(5, 5), ...runs(0, 3)];
    expect(reproRate(history, 5)).toMatchObject({ passed: 5, total: 5, reliable: true });

    // A pending run (pass: null) is present but does not count as passed.
    expect(reproRate([run(null), run(true, 1), run(true, 2)], 3)).toMatchObject({
      passed: 2,
      total: 3,
      reliable: false,
    });
  });

  it("returns a non-reliable zero rate for an empty history (no divide-by-zero)", () => {
    expect(reproRate([])).toEqual({ passed: 0, total: 0, ratio: 0, reliable: false });
  });
});
