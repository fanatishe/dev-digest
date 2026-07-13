import { describe, it, expect } from "vitest";
import { mergeParams, parseSeverity } from "./helpers";

describe("mergeParams", () => {
  // The whole point of the helper: the finding badge writes `tab` AND `finding`
  // together. Two sequential single-key writes would each rebuild the query from
  // the same stale snapshot and the second would clobber the first.
  it("writes several keys in a single pass", () => {
    const q = mergeParams("tab=diff", { tab: "findings", finding: "f1" });
    const sp = new URLSearchParams(q.slice(1));
    expect(sp.get("tab")).toBe("findings");
    expect(sp.get("finding")).toBe("f1");
  });

  it("preserves the params it was not asked to touch", () => {
    const q = mergeParams("tab=diff&severity=CRITICAL", { tab: "findings", finding: "f1" });
    expect(new URLSearchParams(q.slice(1)).get("severity")).toBe("CRITICAL");
  });

  it("deletes a key when its value is null, and drops the '?' when nothing is left", () => {
    expect(mergeParams("tab=findings", { tab: null })).toBe("");
    const q = mergeParams("tab=findings&trace=r1", { trace: null });
    expect(q).toBe("?tab=findings");
  });

  it("returns a leading '?' so it can be appended to a path directly", () => {
    expect(mergeParams("", { tab: "diff" })).toBe("?tab=diff");
  });
});

describe("parseSeverity", () => {
  it("accepts the three known severities verbatim", () => {
    expect(parseSeverity("CRITICAL")).toBe("CRITICAL");
    expect(parseSeverity("WARNING")).toBe("WARNING");
    expect(parseSeverity("SUGGESTION")).toBe("SUGGESTION");
  });

  it("returns null for a missing param", () => {
    expect(parseSeverity(null)).toBeNull();
  });

  // The param is attacker-controlled; an off-list value must NOT pass through
  // (it would silently hide every finding since nothing matches it).
  it("rejects unknown / malformed values as null", () => {
    expect(parseSeverity("INFO")).toBeNull();
    expect(parseSeverity("critical")).toBeNull(); // case-sensitive
    expect(parseSeverity("")).toBeNull();
    expect(parseSeverity("CRITICAL; DROP TABLE findings")).toBeNull();
  });
});
