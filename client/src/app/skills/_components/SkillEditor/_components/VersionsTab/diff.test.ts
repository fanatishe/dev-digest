import { describe, it, expect } from "vitest";
import { lineDiff } from "./diff";

describe("lineDiff", () => {
  it("marks unchanged lines as context", () => {
    expect(lineDiff("a\nb", "a\nb")).toEqual([
      { type: "ctx", text: "a" },
      { type: "ctx", text: "b" },
    ]);
  });

  it("marks an added line", () => {
    expect(lineDiff("a\nc", "a\nb\nc")).toEqual([
      { type: "ctx", text: "a" },
      { type: "add", text: "b" },
      { type: "ctx", text: "c" },
    ]);
  });

  it("marks a removed line", () => {
    expect(lineDiff("a\nb\nc", "a\nc")).toEqual([
      { type: "ctx", text: "a" },
      { type: "del", text: "b" },
      { type: "ctx", text: "c" },
    ]);
  });

  it("marks a replacement as del + add", () => {
    expect(lineDiff("old", "new")).toEqual([
      { type: "del", text: "old" },
      { type: "add", text: "new" },
    ]);
  });
});
