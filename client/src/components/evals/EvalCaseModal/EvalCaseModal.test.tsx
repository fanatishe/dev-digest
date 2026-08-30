import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { FindingRecord, PrDetail } from "@devdigest/shared";
import evalMessages from "../../../../messages/en/eval.json";
import prReviewMessages from "../../../../messages/en/prReview.json";

// ---- Hook mocks (no fetch/QueryClient — the modal takes data via WP-D hooks). The
//      modal is tested in isolation via its own props; FindingsPanel-coupled cases
//      (the AC-3 affordance gating + open-on-select integration) live in the
//      route-scoped FindingsPanel.test.tsx, which may legally import FindingsPanel. ----
const h = vi.hoisted(() => ({
  createMutate: vi.fn(),
  updateMutate: vi.fn(),
  runMutate: vi.fn(),
  caseRuns: { data: [] as unknown[] },
}));

vi.mock("@/lib/hooks/core", () => ({
  usePullDetail: () => ({ data: PR_DETAIL }),
}));
vi.mock("@/lib/hooks/evals", () => ({
  useCreateEvalCase: () => ({ mutateAsync: h.createMutate, isPending: false, isError: false }),
  useUpdateEvalCase: () => ({ mutateAsync: h.updateMutate, isPending: false, isError: false }),
  useRunCase: () => ({ mutateAsync: h.runMutate, isPending: false, isError: false }),
  useCaseRuns: () => ({ data: h.caseRuns.data }),
}));

import { EvalCaseModal } from "./EvalCaseModal";

const PR_DETAIL = {
  files: [
    { path: "src/config.ts", additions: 1, deletions: 0, patch: "@@ -10,6 +10,7 @@\n+  stripeKey: \"sk_live_x\"" },
    { path: "src/server.ts", additions: 0, deletions: 0, patch: "export const config = {}" },
  ],
  title: "Add Stripe integration",
  body: "Wire up payments via Stripe SDK.",
  linked_issue: { number: 311, title: "Payments", body: null, state: "open" },
} as unknown as PrDetail;

function finding(o: Partial<FindingRecord> & { id: string }): FindingRecord {
  return {
    severity: "CRITICAL",
    category: "security",
    title: "Hardcoded Stripe secret key",
    file: "src/config.ts",
    start_line: 12,
    end_line: 12,
    rationale: "A live key is committed.",
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

function renderWithIntl(ui: React.ReactElement) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ eval: evalMessages, prReview: prReviewMessages }}>
      {ui}
    </NextIntlClientProvider>,
  );
}

beforeEach(() => {
  Element.prototype.scrollIntoView = vi.fn();
  h.createMutate.mockReset().mockResolvedValue({ id: "case1" });
  h.runMutate.mockReset().mockResolvedValue([]);
  h.caseRuns.data = [];
});
afterEach(cleanup);

const jsonEditor = () => screen.getByLabelText("Expected output JSON") as HTMLTextAreaElement;

describe("EvalCaseModal — seeding (AC-1)", () => {
  it("seeds one must_find expectation from an accepted finding", () => {
    renderWithIntl(
      <EvalCaseModal owner={{ kind: "agent", id: "a1" }} finding={finding({ id: "f1", accepted_at: "2026-07-19T00:00:00Z" })} prId="pr1" onClose={() => {}} />,
    );
    const text = jsonEditor().value;
    expect(text).toContain('"kind": "must_find"');
    expect(text).toContain('"file": "src/config.ts"');
    expect(text).toContain('"start_line": 12');
    expect(screen.getByText("Must find")).toBeInTheDocument();
  });

  it("seeds a must_not_flag expectation from a dismissed finding", () => {
    renderWithIntl(
      <EvalCaseModal owner={{ kind: "agent", id: "a1" }} finding={finding({ id: "f1", dismissed_at: "2026-07-19T00:00:00Z" })} prId="pr1" onClose={() => {}} />,
    );
    expect(jsonEditor().value).toContain('"kind": "must_not_flag"');
    expect(screen.getByText("Must not flag")).toBeInTheDocument();
  });
});

describe("EvalCaseModal — expected-output validity (AC-4)", () => {
  it("flips the badge invalid and disables Save on malformed JSON, then the skeleton restores validity", () => {
    renderWithIntl(
      <EvalCaseModal owner={{ kind: "agent", id: "a1" }} finding={finding({ id: "f1" })} prId="pr1" onClose={() => {}} />,
    );
    expect(screen.getByText("valid JSON")).toBeInTheDocument();

    fireEvent.change(jsonEditor(), { target: { value: "{ not valid json" } });
    expect(screen.getByText("invalid JSON")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^save$/i })).toBeDisabled();

    fireEvent.click(screen.getByRole("button", { name: /finding skeleton/i }));
    expect(screen.getByText("valid JSON")).toBeInTheDocument();
    expect(jsonEditor().value).toContain('"kind": "must_find"');
    expect(screen.getByRole("button", { name: /^save$/i })).toBeEnabled();
  });
});

describe("EvalCaseModal — run on save (AC-5)", () => {
  it("does not run when the toggle is off (the default), and closes", async () => {
    const onClose = vi.fn();
    renderWithIntl(
      <EvalCaseModal owner={{ kind: "agent", id: "a1" }} finding={finding({ id: "f1" })} prId="pr1" onClose={onClose} />,
    );
    // Run on save now defaults OFF — a plain Save must not trigger a run.
    fireEvent.click(screen.getByRole("button", { name: /^save$/i }));

    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(h.createMutate).toHaveBeenCalledTimes(1);
    expect(h.runMutate).not.toHaveBeenCalled();
  });

  it("runs once and shows a ReproRateStrip when the toggle is turned on", async () => {
    h.caseRuns.data = [
      { id: "run1", case_id: "case1", case_name: null, ran_at: "2026-07-19T00:00:00Z", actual_output: null, pass: true, recall: 1, precision: 1, citation_accuracy: 1, duration_ms: 1800, cost_usd: 0.02 },
    ];
    renderWithIntl(
      <EvalCaseModal owner={{ kind: "agent", id: "a1" }} finding={finding({ id: "f1" })} prId="pr1" onClose={() => {}} />,
    );
    fireEvent.click(screen.getByRole("switch")); // Run on save: off -> on
    fireEvent.click(screen.getByRole("button", { name: /^save$/i }));

    expect(await screen.findByText("Last run passed")).toBeInTheDocument();
    expect(h.createMutate).toHaveBeenCalledTimes(1);
    expect(h.runMutate).toHaveBeenCalledWith({ caseId: "case1", times: 1 });
  });
});

describe("EvalCaseModal — edit mode", () => {
  const existing = {
    id: "case9",
    workspace_id: "ws1",
    owner_kind: "agent",
    owner_id: "a1",
    name: "my-existing-case",
    input_diff: "diff --git a/x b/x",
    input_files: null,
    input_meta: null,
    expected_output: { expectations: [{ kind: "must_find", file: "src/x.ts", start_line: 3, end_line: 4 }] },
    notes: null,
  } as unknown as import("@devdigest/shared").EvalCaseWithRuns;

  it("prefills from the existing case and saves via update, not create", async () => {
    const onClose = vi.fn();
    h.updateMutate.mockReset().mockResolvedValue({ id: "case9" });
    renderWithIntl(
      <EvalCaseModal owner={{ kind: "agent", id: "a1" }} existingCase={existing} onClose={onClose} />,
    );
    // Name + expected-output are prefilled from the stored case.
    expect(screen.getByDisplayValue("my-existing-case")).toBeInTheDocument();
    expect(jsonEditor().value).toContain('"file": "src/x.ts"');

    fireEvent.click(screen.getByRole("button", { name: /^save$/i }));

    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(h.updateMutate).toHaveBeenCalledTimes(1);
    expect(h.updateMutate.mock.calls[0]![0]).toMatchObject({ id: "case9" });
    expect(h.createMutate).not.toHaveBeenCalled();
  });
});
