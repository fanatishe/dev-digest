import { describe, it, expect } from "vitest";
import type { ReviewRecord, FindingRecord } from "@devdigest/shared";
import { findingsByRun } from "./helpers";

function finding(o: Partial<FindingRecord> & { id: string }): FindingRecord {
  return {
    severity: "CRITICAL",
    category: "security",
    title: "A finding",
    file: "src/x.ts",
    start_line: 1,
    end_line: 1,
    rationale: "why",
    suggestion: null,
    confidence: 0.9,
    kind: "finding",
    trifecta_components: null,
    evidence: null,
    review_id: "rv1",
    accepted_at: null,
    dismissed_at: null,
    ...o,
  };
}

function review(o: Partial<ReviewRecord> & { id: string; findings: FindingRecord[] }): ReviewRecord {
  return {
    pr_id: "pr1",
    agent_id: "a1",
    run_id: "run-1",
    agent_name: "Security Reviewer",
    kind: "review",
    verdict: "request_changes",
    summary: null,
    score: 40,
    model: "m",
    grounding: null,
    created_at: "2026-06-11T18:44:34.000Z",
    ...o,
  };
}

describe("findingsByRun", () => {
  it("tallies per-severity counts by run, excluding dismissed", () => {
    const reviews: ReviewRecord[] = [
      review({
        id: "rv1",
        run_id: "run-1",
        findings: [
          finding({ id: "f1", severity: "CRITICAL" }),
          finding({ id: "f2", severity: "WARNING" }),
          finding({ id: "f3", severity: "WARNING", dismissed_at: "2026-06-12T00:00:00Z" }),
        ],
      }),
    ];
    const map = findingsByRun(reviews);
    expect(map.get("run-1")?.counts).toEqual({ CRITICAL: 1, WARNING: 1, SUGGESTION: 0 });
    // The dismissed finding is not in the preview either.
    expect(map.get("run-1")?.preview.map((f) => f.id)).toEqual(["f1", "f2"]);
  });

  it("skips reviews with no run_id and runs with only dismissed findings", () => {
    const reviews: ReviewRecord[] = [
      review({ id: "rv1", run_id: null, findings: [finding({ id: "f1" })] }),
      review({
        id: "rv2",
        run_id: "run-2",
        findings: [finding({ id: "f2", dismissed_at: "2026-06-12T00:00:00Z" })],
      }),
    ];
    const map = findingsByRun(reviews);
    expect(map.size).toBe(0);
  });
});
