import { describe, it, expect } from "vitest";
import { splitDiffByFile } from "./diff";

describe("splitDiffByFile", () => {
  it("splits a multi-file git diff on `diff --git` boundaries", () => {
    const diff = [
      "diff --git a/src/config.ts b/src/config.ts",
      "--- a/src/config.ts",
      "+++ b/src/config.ts",
      "@@ -1,1 +1,2 @@",
      " export const config = {",
      "+  stripeKey: 'x',",
      "diff --git a/src/server.ts b/src/server.ts",
      "--- a/src/server.ts",
      "+++ b/src/server.ts",
      "@@ -1,1 +1,1 @@",
      "-const port = 3000;",
      "+const port = 4000;",
    ].join("\n");

    const files = splitDiffByFile(diff);
    expect(files.map((f) => f.path)).toEqual(["src/config.ts", "src/server.ts"]);
    expect(files[0]!.patch).toContain("stripeKey");
    expect(files[0]!.patch).not.toContain("server.ts");
    expect(files[1]!.patch).toContain("const port = 4000;");
  });

  it("splits a headerless diff on `--- ` file headers", () => {
    const diff = [
      "--- a/a.ts",
      "+++ b/a.ts",
      "@@ -1 +1 @@",
      "-a",
      "+A",
      "--- a/b.ts",
      "+++ b/b.ts",
      "@@ -1 +1 @@",
      "-b",
      "+B",
    ].join("\n");
    expect(splitDiffByFile(diff).map((f) => f.path)).toEqual(["a.ts", "b.ts"]);
  });

  it("returns a single chunk when there is no file boundary marker", () => {
    const diff = "@@ -1 +1 @@\n-a\n+b";
    const files = splitDiffByFile(diff);
    expect(files).toHaveLength(1);
    expect(files[0]!.patch).toContain("+b");
  });

  it("tolerates empty/blank input", () => {
    expect(splitDiffByFile("")).toEqual([]);
    expect(splitDiffByFile(null)).toEqual([]);
    expect(splitDiffByFile("   \n  ")).toEqual([]);
  });
});
