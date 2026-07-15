/* BlastRadiusCard — RTL. `fireEvent`, not `user-event` (not a dependency here). */
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { BlastRadius, PrHistoryItem } from "@devdigest/shared";
import { BlastRadiusCard } from "./BlastRadiusCard";
import blast from "../../../../../../../../messages/en/blast.json";
import brief from "../../../../../../../../messages/en/brief.json";

afterEach(cleanup);

const REPO = "acme/payments-api";
const SHA = "deadbeefcafe";

const BLAST: BlastRadius = {
  changed_symbols: [
    { name: "rateLimit", file: "src/middleware/ratelimit.ts", kind: "function" },
    { name: "bucketKey", file: "src/middleware/ratelimit.ts", kind: "function" },
  ],
  downstream: [
    {
      symbol: "rateLimit",
      callers: [{ name: "publicRouter", file: "src/api/public/index.ts", line: 23 }],
      endpoints_affected: ["GET /api/public/items"],
      crons_affected: [],
    },
    {
      symbol: "bucketKey",
      callers: [{ name: "resetBuckets", file: "src/jobs/reset-buckets.ts", line: 8 }],
      endpoints_affected: [],
      crons_affected: ["reset-rate-buckets (hourly)"],
    },
  ],
  summary: "2 symbols · 2 callers · 1 endpoint · 1 cron/job",
  degraded: false,
  reason: null,
};

const HISTORY: PrHistoryItem[] = [
  {
    pr_number: 356,
    title: "Add ioredis client for session cache",
    merged_at: "2026-02-02T10:00:00Z",
    author: "marisa.koch",
    files_overlap: ["src/middleware/ratelimit.ts"],
    notes: "Touched 1 of the 1 file this PR changes: src/middleware/ratelimit.ts",
    merge_sha: "aaa111",
    number_confirmed: true, // this repo's own PR → /pull/N is safe
  },
  {
    // A fork's inherited UPSTREAM PR: same numbering column, different namespace.
    // The server could not corroborate #12 as this repo's own, so the card must link
    // the merge COMMIT — /pull/12 here would open an unrelated PR.
    pr_number: 12,
    title: "Introduce public API namespace",
    merged_at: "2026-01-10T10:00:00Z",
    author: "deepak.r",
    files_overlap: ["src/middleware/ratelimit.ts"],
    notes: "Touched 1 of the 1 file this PR changes: src/middleware/ratelimit.ts",
    merge_sha: "bbb222",
    number_confirmed: false,
  },
];

function renderCard(over: Partial<React.ComponentProps<typeof BlastRadiusCard>> = {}) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ blast, brief }}>
      <BlastRadiusCard
        blast={BLAST}
        history={HISTORY}
        repoFullName={REPO}
        headSha={SHA}
        onOpenFile={vi.fn()}
        {...over}
      />
    </NextIntlClientProvider>,
  );
}

describe("BlastRadiusCard — the tree", () => {
  it("shows the stat row with DISTINCT endpoint/cron counts", () => {
    renderCard();
    // Both symbols would each contribute endpoints/crons if we summed per-symbol;
    // these are the DISTINCT counts.
    expect(screen.getByRole("listitem", { name: "2 symbols" })).toBeInTheDocument();
    expect(screen.getByRole("listitem", { name: "2 callers" })).toBeInTheDocument();
    expect(screen.getByRole("listitem", { name: "1 endpoints" })).toBeInTheDocument();
    expect(screen.getByRole("listitem", { name: "1 cron/jobs" })).toBeInTheDocument();
  });

  it("expands a symbol to reveal its callers and the endpoints they put at risk", () => {
    renderCard();
    // Collapsed by default — a caller is not on screen yet.
    expect(screen.queryByText("src/api/public/index.ts:23")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /expand callers of rateLimit/i }));

    expect(screen.getByText("src/api/public/index.ts:23")).toBeInTheDocument();
    expect(screen.getByText("GET /api/public/items")).toBeInTheDocument();
  });

  it("links a CALLER out to GitHub — its file is not in this diff", () => {
    // The load-bearing distinction. Callers live in files the PR does not touch, so
    // the diff viewer structurally cannot show them; a link into the diff tab would
    // land on nothing. They must go to GitHub, pinned to the head sha.
    renderCard();
    fireEvent.click(screen.getByRole("button", { name: /expand callers of rateLimit/i }));

    const link = screen.getByRole("link", { name: /open publicRouter/i });
    expect(link).toHaveAttribute(
      "href",
      `https://github.com/${REPO}/blob/${SHA}/src/api/public/index.ts#L23`,
    );
  });

  it("links a CHANGED SYMBOL inward — it IS in the diff", () => {
    const onOpenFile = vi.fn();
    renderCard({ onOpenFile });
    fireEvent.click(screen.getByRole("button", { name: /expand callers of rateLimit/i }));

    fireEvent.click(screen.getByRole("button", { name: /show rateLimit in the diff/i }));
    expect(onOpenFile).toHaveBeenCalledWith("src/middleware/ratelimit.ts");
  });

  it("renders caller locations as plain text when there is no head sha to pin to", () => {
    renderCard({ headSha: null });
    fireEvent.click(screen.getByRole("button", { name: /expand callers of rateLimit/i }));

    expect(screen.getByText("src/api/public/index.ts:23")).toBeInTheDocument();
    // A link with no sha would 404 or silently point at the wrong lines.
    expect(screen.queryByRole("link", { name: /open publicRouter/i })).not.toBeInTheDocument();
  });
});

describe("BlastRadiusCard — the graph", () => {
  it("toggles to the graph view and back", () => {
    renderCard();
    expect(screen.queryByRole("img", { name: /blast radius graph/i })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "graph" }));
    expect(screen.getByRole("img", { name: /blast radius graph/i })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "tree" }));
    expect(screen.queryByRole("img", { name: /blast radius graph/i })).not.toBeInTheDocument();
  });
});

describe("BlastRadiusCard — degraded", () => {
  it('says "unknown", NOT "nothing is affected", and never renders a blank card', () => {
    // THE assertion that matters. An unindexed repo returns an EMPTY blast radius,
    // which reads exactly like "this change breaks nothing" unless the card says
    // otherwise. A silent empty card here is the worst outcome this feature has.
    renderCard({
      blast: {
        changed_symbols: [],
        downstream: [],
        summary: "No indexed symbols in the changed files.",
        degraded: true,
        reason: "no_data",
      },
    });

    expect(screen.getByText(/partial index/i)).toBeInTheDocument();
    const note = screen.getByRole("note");
    expect(within(note).getByText(/has not been indexed yet/i)).toBeInTheDocument();
    expect(within(note).getByText(/“unknown”, not “nothing is affected”/)).toBeInTheDocument();
  });

  it("falls back to a generic explanation for a reason it has no copy for", () => {
    renderCard({
      blast: { ...BLAST, degraded: true, reason: "some_future_reason" },
    });
    // Never render the raw token `some_future_reason` at the reader.
    expect(screen.queryByText(/some_future_reason/)).not.toBeInTheDocument();
    expect(screen.getByRole("note")).toHaveTextContent(/index is incomplete/i);
  });

  it("shows no degraded badge on a healthy index", () => {
    renderCard();
    expect(screen.queryByText(/partial index/i)).not.toBeInTheDocument();
    expect(screen.queryByRole("note")).not.toBeInTheDocument();
  });
});

describe("BlastRadiusCard — refreshing", () => {
  it('badges "Updating…" when a background resync is in flight', () => {
    // The data shown is still valid — the badge only signals a fresher version is coming,
    // so the card still renders its stats, NOT a degraded note.
    renderCard({ blast: { ...BLAST, refreshing: true } });
    expect(screen.getByText(/updating/i)).toBeInTheDocument();
    expect(screen.queryByRole("note")).not.toBeInTheDocument();
    expect(screen.getByRole("listitem", { name: "2 symbols" })).toBeInTheDocument();
  });

  it("shows no updating badge when nothing is refreshing", () => {
    renderCard();
    expect(screen.queryByText(/updating/i)).not.toBeInTheDocument();
  });
});

describe("BlastRadiusCard — prior PRs", () => {
  it("expands to show the prior PR, its overlap note, and a link to GitHub", () => {
    renderCard();
    fireEvent.click(screen.getByRole("button", { name: /prior prs touching these files/i }));

    expect(screen.getByText("Add ioredis client for session cache")).toBeInTheDocument();
    expect(screen.getAllByText(/Touched 1 of the 1 file this PR changes/)).not.toHaveLength(0);
    expect(screen.getByRole("link", { name: /open pull request #356/i })).toHaveAttribute(
      "href",
      `https://github.com/${REPO}/pull/356`,
    );
  });

  it("links an UNCONFIRMED number to its merge commit, never to /pull/N", () => {
    // The fork trap. #12 came from inherited upstream history; on this repo /pull/12 is
    // some other PR entirely. The sha is the only identifier both repos agree on.
    renderCard();
    fireEvent.click(screen.getByRole("button", { name: /prior prs touching these files/i }));

    const link = screen.getByRole("link", { name: /open the merge commit of #12/i });
    expect(link).toHaveAttribute("href", `https://github.com/${REPO}/commit/bbb222`);
    // And no /pull/12 link exists anywhere on the card.
    expect(screen.queryByRole("link", { name: /open pull request #12/i })).not.toBeInTheDocument();
  });

  it("renders an unconfirmed number as plain text when there is no sha either", () => {
    renderCard({
      history: [{ ...HISTORY[1]!, merge_sha: null, number_confirmed: false }],
    });
    fireEvent.click(screen.getByRole("button", { name: /prior prs touching these files/i }));

    expect(screen.getByText("#12")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /#12/i })).not.toBeInTheDocument();
  });

  it("says so explicitly when no prior PR touched these files", () => {
    renderCard({ history: [] });
    fireEvent.click(screen.getByRole("button", { name: /prior prs touching these files/i }));
    expect(screen.getByText(/no prior merged prs touched/i)).toBeInTheDocument();
  });
});
