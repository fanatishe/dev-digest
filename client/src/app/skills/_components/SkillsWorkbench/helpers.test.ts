import { describe, it, expect } from "vitest";
import type { Skill } from "@devdigest/shared";
import { approxTokens, filterSkills, needsVetting } from "./helpers";

const mk = (over: Partial<Skill>): Skill => ({
  id: "x",
  name: "pr-quality-rubric",
  description: "Score PRs against our rubric.",
  type: "rubric",
  source: "manual",
  body: "# rubric",
  enabled: true,
  version: 1,
  evidence_files: null,
  ...over,
});

describe("filterSkills", () => {
  const list = [
    mk({ id: "a", name: "pr-quality-rubric", type: "rubric" }),
    mk({ id: "b", name: "secret-gate", type: "security", description: "Block hardcoded secrets." }),
  ];

  it("returns everything for an empty query", () => {
    expect(filterSkills(list, "  ")).toHaveLength(2);
  });

  it("matches on name, description and type (case-insensitive)", () => {
    expect(filterSkills(list, "SECRET").map((s) => s.id)).toEqual(["b"]);
    expect(filterSkills(list, "security").map((s) => s.id)).toEqual(["b"]);
    expect(filterSkills(list, "rubric").map((s) => s.id)).toEqual(["a"]);
  });
});

describe("needsVetting", () => {
  it("flags unvetted (disabled) skills from a non-manual source", () => {
    expect(needsVetting({ source: "community", enabled: false })).toBe(true);
    expect(needsVetting({ source: "extracted", enabled: false })).toBe(true);
  });
  it("does not flag manual skills or enabled imports", () => {
    expect(needsVetting({ source: "manual", enabled: false })).toBe(false);
    expect(needsVetting({ source: "community", enabled: true })).toBe(false);
  });
});

describe("approxTokens", () => {
  it("estimates ~1 token per 4 chars", () => {
    expect(approxTokens("")).toBe(0);
    expect(approxTokens("abcd")).toBe(1);
    expect(approxTokens("abcde")).toBe(2);
  });
});
