import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { PrFile, SmartDiff } from "@devdigest/shared";
import prReview from "../../../../../../../../messages/en/prReview.json";
import shell from "../../../../../../../../messages/en/shell.json";
import { DiffTab } from "./DiffTab";

// Mock at the HOOK boundary (the app's own network edge) — not at `fetch`.
const smartDiff = vi.fn();
const intent = vi.fn();
vi.mock("@/lib/hooks/smart-diff", () => ({ useSmartDiff: () => smartDiff() }));
vi.mock("@/lib/hooks/intent", () => ({ useIntent: () => intent() }));
vi.mock("@/lib/hooks/reviews", () => ({
  usePrComments: () => ({ data: [] }),
  useCreatePrComment: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));

const CORE_PATCH = ["@@ -1,1 +1,2 @@", " const a = 1;", "+const b = 2;"].join("\n");
const LOCK_PATCH = ["@@ -1,1 +1,2 @@", " lockfileVersion: 9", "+  resolution: {}"].join("\n");

const FILES: PrFile[] = [
  { path: "src/service.ts", additions: 1, deletions: 0, patch: CORE_PATCH },
  { path: "pnpm-lock.yaml", additions: 900, deletions: 0, patch: LOCK_PATCH },
];

const SMART: SmartDiff = {
  groups: [
    {
      role: "core",
      files: [
        { path: "src/service.ts", pseudocode_summary: null, additions: 1, deletions: 0, finding_lines: [] },
      ],
    },
    {
      role: "boilerplate",
      files: [
        { path: "pnpm-lock.yaml", pseudocode_summary: null, additions: 900, deletions: 0, finding_lines: [] },
      ],
    },
  ],
  split_suggestion: { too_big: false, total_lines: 901, proposed_splits: [] },
};

beforeEach(() => {
  smartDiff.mockReturnValue({ data: SMART });
  intent.mockReturnValue({ data: null });
});
afterEach(cleanup);

function renderTab() {
  return render(
    <NextIntlClientProvider locale="en" messages={{ prReview, shell }}>
      <DiffTab
        prId="pr-1"
        filesCount={FILES.length}
        files={FILES}
        findings={[]}
        onOpenFinding={() => {}}
      />
    </NextIntlClientProvider>,
  );
}

describe("DiffTab", () => {
  it("defaults to Smart order, and the toggle switches to the flat viewer and back", () => {
    renderTab();

    // Smart order: role group headings, boilerplate collapsed.
    expect(screen.getByRole("heading", { name: "Core" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Boilerplate" })).toBeInTheDocument();
    expect(screen.queryByText("resolution: {}")).not.toBeInTheDocument();

    // Toggle → the flat DiffViewer: no group headings, and the lock file is now
    // subject only to the viewer's own size rule (900 lines ⇒ still collapsed),
    // but the grouping is gone.
    fireEvent.click(screen.getByRole("button", { name: /original order/i }));
    expect(screen.queryByRole("heading", { name: "Core" })).not.toBeInTheDocument();
    expect(screen.getByText("src/service.ts")).toBeInTheDocument();
    expect(screen.getByText("const b = 2;")).toBeInTheDocument();

    // …and back.
    fireEvent.click(screen.getByRole("button", { name: /smart order/i }));
    expect(screen.getByRole("heading", { name: "Core" })).toBeInTheDocument();
  });

  it("falls back to the flat viewer (and hides the toggle) when the smart-diff query errors", () => {
    smartDiff.mockReturnValue({ data: undefined, isError: true });
    renderTab();

    expect(screen.queryByRole("heading", { name: "Core" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /order/i })).not.toBeInTheDocument();
    // The diff itself still renders — the tab is never worse than it was.
    expect(screen.getByText("src/service.ts")).toBeInTheDocument();
    expect(screen.getByText("const b = 2;")).toBeInTheDocument();
  });
});
