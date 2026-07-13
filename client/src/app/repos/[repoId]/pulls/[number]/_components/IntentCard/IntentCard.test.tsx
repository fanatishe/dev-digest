import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { PrIntentRecord } from "@devdigest/shared";
import messages from "../../../../../../../../messages/en/brief.json";
import { IntentCard } from "./IntentCard";

afterEach(cleanup);

const INTENT: PrIntentRecord = {
  pr_id: "pr-1",
  intent:
    "Add rate limiting to public API endpoints to prevent abuse from unauthenticated clients.",
  in_scope: ["Add middleware for rate limiting", "Apply to /api/public/* routes"],
  out_of_scope: ["Authentication changes", "Adding new endpoints"],
  risk_areas: ["Auth surface touched", "New dependency: ioredis"],
  derived_from: ["pr_body", "issue #123"],
  head_sha: "abc1234",
  provider: "openrouter",
  model: "deepseek/deepseek-v4-flash",
  tokens_full: 12431,
  tokens_headers: 890,
  computed_at: "2026-07-12T10:00:00.000Z",
  is_stale: false,
};

function renderCard(props: Partial<React.ComponentProps<typeof IntentCard>> = {}) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ brief: messages }}>
      <IntentCard intent={INTENT} onRecompute={() => {}} {...props} />
    </NextIntlClientProvider>,
  );
}

describe("IntentCard", () => {
  it("renders the summary, both scope lists and the risk chips", () => {
    renderCard();

    expect(screen.getByText(/Add rate limiting to public API endpoints/)).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /in scope/i })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /out of scope/i })).toBeInTheDocument();
    expect(screen.getByText("Add middleware for rate limiting")).toBeInTheDocument();
    expect(screen.getByText("Authentication changes")).toBeInTheDocument();
    expect(screen.getByText("Auth surface touched")).toBeInTheDocument();
    expect(screen.getByText("New dependency: ioredis")).toBeInTheDocument();

    // tokens saved is DERIVED at render from tokens_full / tokens_headers
    expect(screen.getByText("12,431 → 890 tokens (93% saved)")).toBeInTheDocument();
    expect(screen.getByText(/derived from: pr_body, issue #123/)).toBeInTheDocument();
    expect(screen.queryByText(/stale/i)).not.toBeInTheDocument();
  });

  it("fires onRecompute when the recompute button is clicked", () => {
    const onRecompute = vi.fn();
    renderCard({ onRecompute });

    fireEvent.click(screen.getByRole("button", { name: /recompute/i }));
    expect(onRecompute).toHaveBeenCalledTimes(1);
  });

  it("shows the stale badge when the PR head has moved since the intent was derived", () => {
    renderCard({ intent: { ...INTENT, is_stale: true } });
    expect(screen.getByText("Stale")).toBeInTheDocument();
  });

  it("renders cleanly for a PR with no description — no risk areas, metadata-only sources", () => {
    renderCard({
      intent: {
        ...INTENT,
        risk_areas: [],
        derived_from: ["title", "branch", "commits", "files"],
      },
    });

    expect(screen.getByText("No notable risks flagged.")).toBeInTheDocument();
    expect(
      screen.getByText(/derived from: title, branch, commits, files/),
    ).toBeInTheDocument();
    // provenance is never a clickable link — it is untrusted, author-derived text
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
  });

  it("shows the empty state (and still a working recompute button) when no intent exists", () => {
    const onRecompute = vi.fn();
    renderCard({ intent: null, onRecompute });

    expect(screen.getByText("No intent derived yet.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /recompute/i }));
    expect(onRecompute).toHaveBeenCalledTimes(1);
  });
});
