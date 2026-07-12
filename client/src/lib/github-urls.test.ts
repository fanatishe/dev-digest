import { describe, it, expect } from "vitest";
import { githubBlobUrl, githubPrUrl, parseEvidencePath } from "./github-urls";

/**
 * `parseEvidencePath` unpacks the string the conventions extractor packs into
 * `evidence_path` ("file:start-end"). It feeds githubBlobUrl, so a mis-parse would
 * silently cite the wrong lines — hence the edge cases below.
 */
describe("parseEvidencePath", () => {
  it("splits a file with a line range", () => {
    expect(parseEvidencePath("src/api/users.ts:23-25")).toEqual({
      file: "src/api/users.ts",
      start: 23,
      end: 25,
    });
  });

  it("splits a file with a single line", () => {
    expect(parseEvidencePath("src/api/users.ts:23")).toEqual({
      file: "src/api/users.ts",
      start: 23,
    });
  });

  it("returns a bare path unchanged when there is no line suffix", () => {
    expect(parseEvidencePath("package.json")).toEqual({ file: "package.json" });
  });

  it("splits on the LAST colon so a path containing one survives", () => {
    expect(parseEvidencePath("src/weird:name/f.ts:7-9")).toEqual({
      file: "src/weird:name/f.ts",
      start: 7,
      end: 9,
    });
  });

  it("treats a non-numeric suffix as part of the path, not a line spec", () => {
    expect(parseEvidencePath("src/weird:name.ts")).toEqual({ file: "src/weird:name.ts" });
  });
});

describe("githubBlobUrl", () => {
  it("builds a blob URL pinned to a sha with a line range", () => {
    expect(githubBlobUrl("acme/payments-api", "a1b2c3d", "src/api/users.ts", 23, 25)).toBe(
      "https://github.com/acme/payments-api/blob/a1b2c3d/src/api/users.ts#L23-L25",
    );
  });

  it("omits the end anchor for a single line", () => {
    expect(githubBlobUrl("acme/payments-api", "a1b2c3d", "src/api/users.ts", 23)).toBe(
      "https://github.com/acme/payments-api/blob/a1b2c3d/src/api/users.ts#L23",
    );
  });
});

describe("githubPrUrl", () => {
  it("builds a PR URL", () => {
    expect(githubPrUrl("acme/payments-api", 42)).toBe(
      "https://github.com/acme/payments-api/pull/42",
    );
  });
});
