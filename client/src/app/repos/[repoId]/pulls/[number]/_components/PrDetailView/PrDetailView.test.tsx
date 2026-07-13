/* The regression test for the deep-link: clicking a severity badge in the diff must
   land on the Findings tab WITH that finding revealed — in ONE router.replace.

   Two sequential single-key writes would each rebuild the query from the same stale
   `search` snapshot, so the second would clobber the first and the badge would open
   the Findings tab with no finding (or reveal a finding on the wrong tab). This test
   asserts BOTH keys land in a SINGLE navigation, and that it is `replace` (no reload)
   rather than a full-page navigation. */
import { describe, it, expect, vi, beforeEach, beforeAll, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { NextIntlClientProvider } from "next-intl";
import type { PrDetail, PrIntentRecord, ReviewRecord, SmartDiff } from "@devdigest/shared";
import prReview from "../../../../../../../../messages/en/prReview.json";
import shell from "../../../../../../../../messages/en/shell.json";
import { PrDetailView } from "./PrDetailView";

const replace = vi.fn();
const push = vi.fn();
// The tab starts on `diff` — exactly the state the badge is clicked from.
let search = new URLSearchParams("tab=diff");

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace, push, prefetch: vi.fn() }),
  useSearchParams: () => search,
  usePathname: () => "/repos/r1/pulls/7",
}));

// App chrome — out of scope for this test, and it drags in the whole shell
// (command palette, global shortcuts, repo context).
vi.mock("@/components/app-shell", () => ({
  AppShell: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

const PATCH = ["@@ -1,1 +1,2 @@", " const a = 1;", "+const b = 2;"].join("\n");

const PR: PrDetail = {
  id: "pr-1",
  number: 7,
  title: "Add rate limiting",
  author: "octocat",
  branch: "feat/rate-limit",
  base: "main",
  status: "open",
  additions: 1,
  deletions: 0,
  files_count: 1,
  head_sha: "abc1234",
  body: null,
  opened_at: "2026-07-13T09:00:00.000Z",
  updated_at: "2026-07-13T09:00:00.000Z",
  files: [{ path: "src/service.ts", additions: 1, deletions: 0, patch: PATCH }],
  commits: [],
};

const REVIEW: ReviewRecord = {
  id: "rev-1",
  pr_id: "pr-1",
  agent_id: "ag-1",
  run_id: "run-1",
  agent_name: "Security Reviewer",
  kind: "review",
  verdict: "request_changes",
  summary: null,
  score: 40,
  model: "gpt-4.1",
  grounding: null,
  created_at: "2026-07-13T10:00:00.000Z",
  findings: [
    {
      id: "f1",
      severity: "CRITICAL",
      category: "security",
      title: "Hardcoded Stripe secret key",
      file: "src/service.ts",
      start_line: 2, // the `+const b = 2;` line — RIGHT (new-file) side
      end_line: 2,
      rationale: "A live key is committed.",
      suggestion: null,
      confidence: 0.95,
      kind: "finding",
      trifecta_components: null,
      evidence: null,
      review_id: "rev-1",
      accepted_at: null,
      dismissed_at: null,
    },
  ],
};

const SMART: SmartDiff = {
  groups: [
    {
      role: "core",
      files: [
        { path: "src/service.ts", pseudocode_summary: null, additions: 1, deletions: 0, finding_lines: [2] },
      ],
    },
  ],
  split_suggestion: { too_big: false, total_lines: 1, proposed_splits: [] },
};

const INTENT: PrIntentRecord | null = null;

vi.mock("@/lib/hooks", () => ({
  usePulls: () => ({ data: [{ id: "pr-1", number: 7 }], isLoading: false }),
  usePullDetail: () => ({ data: PR, isLoading: false, isError: false, error: null, refetch: vi.fn() }),
}));
vi.mock("@/lib/hooks/reviews", () => ({
  usePrReviews: () => ({ data: [REVIEW], refetch: vi.fn() }),
  usePrActiveRuns: () => ({ data: [] }),
  usePrRuns: () => ({ data: [] }),
  useCancelRun: () => ({ mutate: vi.fn(), isPending: false }),
  useDeleteRun: () => ({ mutate: vi.fn(), isPending: false }),
  usePrComments: () => ({ data: [] }),
  useCreatePrComment: () => ({ mutateAsync: vi.fn(), isPending: false }),
  // Used by the header's RunReviewDropdown, which renders inside this view.
  useRunReview: () => ({ mutate: vi.fn(), mutateAsync: vi.fn(), isPending: false }),
}));
vi.mock("@/lib/hooks/agents", () => ({ useAgents: () => ({ data: [] }) }));
vi.mock("@/lib/hooks/smart-diff", () => ({ useSmartDiff: () => ({ data: SMART }) }));
vi.mock("@/lib/hooks/intent", () => ({ useIntent: () => ({ data: INTENT }) }));
vi.mock("@/lib/repo-context", () => ({
  useActiveRepo: () => ({ activeRepo: { id: "r1", full_name: "acme/api" } }),
  useRepoNotFound: () => false,
}));
vi.mock("@/lib/confirm", () => ({ useConfirm: () => vi.fn(async () => true) }));

// jsdom does not implement scrollIntoView — the reveal effect throws without this.
beforeAll(() => {
  Element.prototype.scrollIntoView = vi.fn();
});
beforeEach(() => {
  replace.mockClear();
  push.mockClear();
  search = new URLSearchParams("tab=diff");
});
afterEach(cleanup);

function renderView() {
  const qc = new QueryClient();
  return render(
    <QueryClientProvider client={qc}>
      <NextIntlClientProvider locale="en" messages={{ prReview, shell }}>
        <PrDetailView repoId="r1" number="7" />
      </NextIntlClientProvider>
    </QueryClientProvider>,
  );
}

describe("PrDetailView — finding badge deep-link", () => {
  it("sets tab=findings AND finding=<id> in ONE router.replace (no clobber, no reload)", () => {
    renderView();

    fireEvent.click(
      screen.getByRole("button", { name: /open finding: hardcoded stripe secret key/i }),
    );

    // ONE navigation, not two: a second replace would mean the stale-`search`
    // clobber is back.
    expect(replace).toHaveBeenCalledTimes(1);
    expect(push).not.toHaveBeenCalled(); // replace ⇒ no page reload

    const url = new URL(replace.mock.calls[0]![0] as string, "http://localhost");
    expect(url.pathname).toBe("/repos/r1/pulls/7");
    expect(url.searchParams.get("tab")).toBe("findings");
    expect(url.searchParams.get("finding")).toBe("f1");
  });

  it("keeps unrelated params (e.g. ?severity=) while writing both keys", () => {
    search = new URLSearchParams("tab=diff&severity=CRITICAL");
    renderView();

    fireEvent.click(
      screen.getByRole("button", { name: /open finding: hardcoded stripe secret key/i }),
    );

    const url = new URL(replace.mock.calls[0]![0] as string, "http://localhost");
    expect(url.searchParams.get("tab")).toBe("findings");
    expect(url.searchParams.get("finding")).toBe("f1");
    expect(url.searchParams.get("severity")).toBe("CRITICAL");
  });
});
