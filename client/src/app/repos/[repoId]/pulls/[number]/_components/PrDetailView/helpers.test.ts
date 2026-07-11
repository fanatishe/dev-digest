import { describe, it, expect } from "vitest";
import { parseSeverity } from "./helpers";

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
