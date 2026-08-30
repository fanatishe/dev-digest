import { describe, it, expect } from "vitest";
import type { PrDetail } from "@devdigest/shared";
import { seedDiff } from "./helpers";
import { splitDiffByFile } from "./diff";

/** GitHub's PrFile.patch is HEADERLESS — starts at `@@`, no `+++ b/<path>`. seedDiff must
    add git headers, or the stored input_diff parses to ZERO files server-side and every
    must_find case fails. */
const HEADERLESS = '@@ -10,6 +10,7 @@\n export const config = {\n+  stripeKey: "x",\n   redisUrl: y,\n };';

const detail = {
  files: [
    { path: "src/config.ts", additions: 1, deletions: 0, patch: HEADERLESS },
    { path: "src/server.ts", additions: 0, deletions: 0, patch: "@@ -1 +1 @@\n-a\n+b" },
  ],
  title: "t",
  body: "b",
  linked_issue: null,
} as unknown as PrDetail;

describe("seedDiff", () => {
  it("adds git headers to a single headerless file patch so it is attributable to a path", () => {
    const diff = seedDiff(detail, "src/config.ts");
    expect(diff).toContain("diff --git a/src/config.ts b/src/config.ts");
    expect(diff).toContain("+++ b/src/config.ts");
    expect(diff).toContain('+  stripeKey: "x",');
    // Round-trips: it now splits back into exactly that one file (0 files before the fix).
    expect(splitDiffByFile(diff).map((f) => f.path)).toEqual(["src/config.ts"]);
  });

  it("headers every file when joining the whole PR (no file arg)", () => {
    const diff = seedDiff(detail);
    expect(splitDiffByFile(diff).map((f) => f.path)).toEqual(["src/config.ts", "src/server.ts"]);
  });

  it("does not double-header a patch that already carries one", () => {
    const withHeader = {
      files: [{ path: "x.ts", additions: 1, deletions: 0, patch: "diff --git a/x.ts b/x.ts\n--- a/x.ts\n+++ b/x.ts\n@@ -1 +1 @@\n+z" }],
    } as unknown as PrDetail;
    const diff = seedDiff(withHeader, "x.ts");
    expect(diff.match(/diff --git/g)).toHaveLength(1);
  });

  it("returns empty string when there is no PR detail", () => {
    expect(seedDiff(undefined)).toBe("");
  });
});
