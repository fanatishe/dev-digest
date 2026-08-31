import { describe, it, expect } from "vitest";
import { readSkillPair } from "./helpers";

describe("readSkillPair", () => {
  it("reads the with/without recall from a skill run's paired actual_output", () => {
    const pair = readSkillPair({
      with: { recall: 1, precision: 1, citation_accuracy: 1, pass: true, grounded: [] },
      without: { recall: 0, precision: 1, citation_accuracy: 1, pass: false, grounded: [] },
    });
    expect(pair).toEqual({ withRecall: 1, withoutRecall: 0 });
  });

  it("returns null for an agent run (actual_output is a grounded-finding array)", () => {
    expect(readSkillPair([{ id: "f1", recall: 1 }])).toBeNull();
  });

  it("returns null for null / malformed / partial payloads (never throws)", () => {
    expect(readSkillPair(null)).toBeNull();
    expect(readSkillPair(undefined)).toBeNull();
    expect(readSkillPair({ with: { recall: 1 } })).toBeNull(); // no `without`
    expect(readSkillPair({ with: {}, without: {} })).toBeNull(); // no numeric recall
  });
});
