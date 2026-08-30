import { describe, it, expect } from "vitest";
import { buildUnifiedDiff, splitUnifiedDiff } from "./diff";

describe("buildUnifiedDiff", () => {
  it("builds a modified-file whole-file replacement patch", () => {
    const patch = buildUnifiedDiff({
      file: "src/x.ts",
      before: "const a = 1;\nconst b = 2;",
      after: "const a = 1;",
      newFile: false,
    });
    expect(patch).toContain("diff --git a/src/x.ts b/src/x.ts");
    expect(patch).toContain("--- a/src/x.ts");
    expect(patch).toContain("@@ -1,2 +1,1 @@");
    expect(patch).toContain("-const b = 2;");
    expect(patch).toContain("+const a = 1;");
  });

  it("builds a new-file patch against /dev/null", () => {
    const patch = buildUnifiedDiff({ file: "t/new.ts", before: "", after: "x\ny", newFile: true });
    expect(patch).toContain("--- /dev/null");
    expect(patch).toContain("@@ -0,0 +1,2 @@");
    // No deletion (body) lines for a new file.
    const delLines = patch.split("\n").filter((l) => l.startsWith("-") && !l.startsWith("---"));
    expect(delLines).toEqual([]);
    expect(patch).toContain("+x");
    expect(patch).toContain("+y");
  });
});

describe("splitUnifiedDiff", () => {
  it("round-trips a modified file (header lines never leak into content)", () => {
    const parts = { file: "src/x.ts", before: "a\nb", after: "a", newFile: false };
    const back = splitUnifiedDiff(buildUnifiedDiff(parts));
    expect(back).toEqual(parts);
    expect(back.before).not.toContain("diff --git");
  });

  it("round-trips a new file", () => {
    const parts = { file: "t/new.ts", before: "", after: "x\ny", newFile: true };
    expect(splitUnifiedDiff(buildUnifiedDiff(parts))).toEqual(parts);
  });

  it("tolerates an empty/blank patch", () => {
    expect(splitUnifiedDiff("")).toEqual({ file: "snippet.ts", before: "", after: "", newFile: false });
  });
});
