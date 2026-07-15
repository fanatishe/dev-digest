import { describe, it, expect } from "vitest";
import type { BlastRadius } from "@devdigest/shared";
import { blastStats, degradedKey, ellipsize, graphableSymbols } from "./helpers";

const BLAST: BlastRadius = {
  changed_symbols: [
    { name: "rateLimit", file: "src/middleware/ratelimit.ts", kind: "function" },
    { name: "bucketKey", file: "src/middleware/ratelimit.ts", kind: "function" },
  ],
  downstream: [
    {
      symbol: "rateLimit",
      callers: [
        { name: "publicRouter", file: "src/api/public/index.ts", line: 23 },
        { name: "healthCheck", file: "src/api/public/health.ts", line: 11 },
      ],
      // Both symbols reach this endpoint.
      endpoints_affected: ["GET /api/public/items"],
      crons_affected: [],
    },
    {
      symbol: "bucketKey",
      callers: [{ name: "resetBuckets", file: "src/jobs/reset-buckets.ts", line: 8 }],
      endpoints_affected: ["GET /api/public/items"],
      crons_affected: ["reset-rate-buckets (hourly)"],
    },
  ],
  summary: "2 symbols · 3 callers · 1 endpoint · 1 cron/job",
  degraded: false,
  reason: null,
};

describe("blastStats", () => {
  it("counts DISTINCT endpoints and crons, not the per-symbol sum", () => {
    const stats = blastStats(BLAST);
    // Both symbols list "GET /api/public/items". Summing would say 2 endpoints are at
    // risk when only ONE is — and that number is what the reviewer anchors on.
    expect(stats.endpoints).toBe(1);
    expect(stats.crons).toBe(1);
  });

  it("SUMS callers — the same file calling two symbols is two call sites to look at", () => {
    expect(blastStats(BLAST).callers).toBe(3);
  });

  it("counts changed symbols, including any with no callers", () => {
    expect(blastStats(BLAST).symbols).toBe(2);
    expect(
      blastStats({ ...BLAST, changed_symbols: [], downstream: [] }),
    ).toEqual({ symbols: 0, callers: 0, endpoints: 0, crons: 0 });
  });
});

describe("degradedKey", () => {
  const KNOWN = ["no_data", "index_partial"];

  it("passes a known reason through", () => {
    expect(degradedKey("no_data", KNOWN)).toBe("no_data");
  });

  it("falls back to `unknown` rather than rendering a raw enum token at the user", () => {
    expect(degradedKey("some_new_reason", KNOWN)).toBe("unknown");
    expect(degradedKey(null, KNOWN)).toBe("unknown");
    expect(degradedKey(undefined, KNOWN)).toBe("unknown");
  });
});

describe("graphableSymbols", () => {
  it("drops symbols with nowhere to go — an isolated node is not a graph", () => {
    const withOrphan: BlastRadius = {
      ...BLAST,
      downstream: [
        ...BLAST.downstream,
        { symbol: "unusedHelper", callers: [], endpoints_affected: [], crons_affected: [] },
      ],
    };
    expect(graphableSymbols(withOrphan).map((d) => d.symbol)).toEqual([
      "rateLimit",
      "bucketKey",
    ]);
  });
});

describe("ellipsize", () => {
  it("leaves short text alone and truncates long text with an ellipsis", () => {
    expect(ellipsize("short", 10)).toBe("short");
    expect(ellipsize("averylongsymbolname", 10)).toBe("averylong…");
    expect(ellipsize("averylongsymbolname", 10)).toHaveLength(10);
  });
});
