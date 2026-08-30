import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { FindingRecord, PrDetail, ReviewRecord } from "@devdigest/shared";
import evalMessages from "../../../../../../../../messages/en/eval.json";
import messages from "../../../../../../../../messages/en/prReview.json";

// FindingsPanel derives each finding's agent_id from the PR's reviews to gate the
// "Turn into eval case" affordance (AC-3); opening it renders EvalCaseModal, which
// pulls PR detail + eval hooks. All data arrives via mocked WP-D hooks — no fetch.
const h = vi.hoisted(() => ({
  reviews: { data: [] as unknown[] },
}));

vi.mock("../../../../../../../lib/hooks/reviews", () => ({
  useFindingAction: () => ({ mutate: vi.fn(), isPending: false }),
  usePrReviews: () => ({ data: h.reviews.data }),
}));
vi.mock("@/lib/hooks/core", () => ({
  usePullDetail: () => ({ data: PR_DETAIL }),
}));
vi.mock("@/lib/hooks/evals", () => ({
  useCreateEvalCase: () => ({ mutateAsync: vi.fn(), isPending: false, isError: false }),
  useUpdateEvalCase: () => ({ mutateAsync: vi.fn(), isPending: false, isError: false }),
  useRunCase: () => ({ mutateAsync: vi.fn(), isPending: false, isError: false }),
  useCaseRuns: () => ({ data: [] }),
}));

import { FindingsPanel } from "./FindingsPanel";

const PR_DETAIL = {
  files: [
    { path: "src/config.ts", additions: 1, deletions: 0, patch: "@@ -10,6 +10,7 @@\n+  stripeKey: \"sk_live_x\"" },
  ],
  title: "Add Stripe integration",
  body: "Wire up payments via Stripe SDK.",
  linked_issue: null,
} as unknown as PrDetail;

afterEach(cleanup);
beforeEach(() => {
  Element.prototype.scrollIntoView = vi.fn();
  h.reviews.data = [];
});

function finding(o: Partial<FindingRecord> & { id: string }): FindingRecord {
  return {
    severity: "CRITICAL",
    category: "security",
    title: "Hardcoded secret",
    file: "src/config.ts",
    start_line: 11,
    end_line: 11,
    rationale: "A secret is committed.",
    suggestion: null,
    confidence: 0.95,
    kind: "finding",
    trifecta_components: null,
    evidence: null,
    review_id: "r1",
    accepted_at: null,
    dismissed_at: null,
    ...o,
  };
}

function review(o: Partial<ReviewRecord> & { id: string }): ReviewRecord {
  return {
    pr_id: "pr1",
    agent_id: null,
    run_id: null,
    agent_name: "Security Reviewer",
    kind: "review",
    verdict: "request_changes",
    summary: null,
    score: 40,
    model: "gpt-4.1",
    created_at: "2026-07-19T00:00:00Z",
    findings: [],
    ...o,
  };
}

const FINDINGS: FindingRecord[] = [finding({ id: "f1" })];

function renderWithIntl(ui: React.ReactElement) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ eval: evalMessages, prReview: messages }}>
      {ui}
    </NextIntlClientProvider>,
  );
}

describe("FindingsPanel (smoke)", () => {
  it("renders the toolbar + a finding card", () => {
    renderWithIntl(<FindingsPanel findings={FINDINGS} prId="pr1" />);
    expect(screen.getByText("Hide low confidence")).toBeInTheDocument();
    expect(screen.getByText("Hardcoded secret")).toBeInTheDocument();
  });

  it("shows the empty state when nothing matches", () => {
    renderWithIntl(<FindingsPanel findings={[]} prId="pr1" />);
    expect(screen.getByText("No findings match")).toBeInTheDocument();
  });

  it("keeps only the requested severity when the severity filter is set", () => {
    const mixed: FindingRecord[] = [
      finding({ id: "f1", severity: "CRITICAL", title: "Critical one" }),
      finding({ id: "f2", severity: "WARNING", title: "Warning one" }),
    ];
    renderWithIntl(<FindingsPanel findings={mixed} prId="pr1" severity="WARNING" />);
    expect(screen.getByText("Warning one")).toBeInTheDocument();
    expect(screen.queryByText("Critical one")).not.toBeInTheDocument();
  });

  it("expands a revealed finding that isn't the default-open first card", () => {
    const list: FindingRecord[] = [
      finding({ id: "f1", severity: "CRITICAL", title: "First" }),
      finding({ id: "f2", severity: "WARNING", title: "Second", rationale: "second rationale here" }),
    ];
    renderWithIntl(
      <FindingsPanel findings={list} prId="pr1" revealFindingId="f2" revealNonce={1} />,
    );
    // f2 sorts after f1 (not default-open) but the reveal expands its body.
    expect(screen.getByText("second rationale here")).toBeInTheDocument();
  });

  it("force-includes a revealed finding a severity filter would otherwise hide", () => {
    const list: FindingRecord[] = [
      finding({ id: "f1", severity: "CRITICAL", title: "Crit only" }),
      finding({ id: "f2", severity: "WARNING", title: "Warn hidden" }),
    ];
    renderWithIntl(
      <FindingsPanel
        findings={list}
        prId="pr1"
        severity="CRITICAL"
        revealFindingId="f2"
        revealNonce={1}
      />,
    );
    expect(screen.getByText("Warn hidden")).toBeInTheDocument();
  });
});

describe("FindingsPanel — turn-into-eval affordance gating (AC-3)", () => {
  it("hides the affordance when the finding's review has no agent_id", () => {
    h.reviews.data = [review({ id: "r1", agent_id: null })];
    renderWithIntl(<FindingsPanel findings={[finding({ id: "f1", review_id: "r1" })]} prId="pr1" />);
    expect(screen.queryByRole("button", { name: /turn .* into an eval case/i })).not.toBeInTheDocument();
  });

  it("shows the affordance and opens the modal when the review has an agent_id", () => {
    h.reviews.data = [review({ id: "r1", agent_id: "agent-1" })];
    renderWithIntl(<FindingsPanel findings={[finding({ id: "f1", review_id: "r1" })]} prId="pr1" />);

    const btn = screen.getByRole("button", { name: /turn .* into an eval case/i });
    fireEvent.click(btn);
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByText("Must find")).toBeInTheDocument();
  });
});
