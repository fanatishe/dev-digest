import { describe, it, expect } from "vitest";
import type { FindingRecord, ReviewRecord } from "@devdigest/shared";
import { orderedRiskFindings, focusFindings, REVIEW_FOCUS_CAP } from "./helpers";

function finding(over: Partial<FindingRecord> & Pick<FindingRecord, "id">): FindingRecord {
  return {
    review_id: "rev-1",
    severity: "WARNING",
    category: "bug",
    title: over.id,
    file: "src/x.ts",
    start_line: 1,
    end_line: 1,
    rationale: "",
    suggestion: null,
    confidence: 0.5,
    kind: "finding",
    trifecta_components: null,
    evidence: null,
    accepted_at: null,
    dismissed_at: null,
    ...over,
  };
}

function review(over: Partial<ReviewRecord> & Pick<ReviewRecord, "id" | "findings">): ReviewRecord {
  return {
    pr_id: "pr-1",
    agent_id: "a1",
    run_id: "r1",
    kind: "review",
    verdict: "request_changes",
    summary: null,
    score: 60,
    model: "m",
    created_at: "2026-07-17T00:00:00.000Z",
    ...over,
  };
}

describe("orderedRiskFindings", () => {
  it("returns [] for no reviews", () => {
    expect(orderedRiskFindings(undefined)).toEqual([]);
    expect(orderedRiskFindings([])).toEqual([]);
  });

  it("picks the latest 'review' kind, excludes dismissed, and orders by severity then confidence", () => {
    const reviews: ReviewRecord[] = [
      // newest-first: a summary row (no findings) then the review row
      review({ id: "sum", kind: "summary", findings: [] }),
      review({
        id: "rev",
        findings: [
          finding({ id: "warn-hi", severity: "WARNING", confidence: 0.9 }),
          finding({ id: "crit", severity: "CRITICAL", confidence: 0.4 }),
          finding({ id: "dismissed", severity: "CRITICAL", confidence: 0.99, dismissed_at: "2026-07-17T01:00:00Z" }),
          finding({ id: "warn-lo", severity: "WARNING", confidence: 0.3 }),
          finding({ id: "sugg", severity: "SUGGESTION", confidence: 0.99 }),
        ],
      }),
    ];

    const out = orderedRiskFindings(reviews).map((f) => f.id);
    // dismissed dropped; CRITICAL first, then WARNINGs by confidence desc, then SUGGESTION
    expect(out).toEqual(["crit", "warn-hi", "warn-lo", "sugg"]);
  });
});

describe("focusFindings", () => {
  it("caps to the top N in the given order", () => {
    const many = Array.from({ length: REVIEW_FOCUS_CAP + 3 }, (_, i) => finding({ id: `f${i}` }));
    const out = focusFindings(many);
    expect(out).toHaveLength(REVIEW_FOCUS_CAP);
    expect(out[0]?.id).toBe("f0");
  });
});
