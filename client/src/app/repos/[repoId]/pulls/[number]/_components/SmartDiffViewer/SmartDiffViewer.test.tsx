import { describe, it, expect, vi, beforeAll, afterEach } from "vitest";
// NOTE: `@testing-library/user-event` is not a dependency of this package — every
// existing client test drives interaction with `fireEvent`. Matching the house setup.
import { render, screen, cleanup, fireEvent, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { PrFile, PrIntentRecord, SmartDiff } from "@devdigest/shared";
import type { DiffFinding } from "@/components/diff-viewer";
import prReview from "../../../../../../../../messages/en/prReview.json";
import shell from "../../../../../../../../messages/en/shell.json";
import { SmartDiffViewer } from "./SmartDiffViewer";

// jsdom has no scrollIntoView; FileCard/CodeLine don't call it, but the shared
// diff-viewer tree is the same one the reveal chain uses — stub it defensively.
beforeAll(() => {
  Element.prototype.scrollIntoView = vi.fn();
});
afterEach(cleanup);

// Distinct bodies per file, so "is this file's body rendered?" is unambiguous.
// In the core patch, `+const b = 2;` is new-file line 2 — the finding's anchor.
const CORE_PATCH = ["@@ -1,2 +1,3 @@", " const a = 1;", "+const b = 2;"].join("\n");
const WIRING_PATCH = ["@@ -1,1 +1,2 @@", " export {};", "+export * from './service';"].join("\n");
const LOCK_PATCH = ["@@ -1,1 +1,2 @@", " lockfileVersion: 9", "+  resolution: {}"].join("\n");

const FILES: PrFile[] = [
  { path: "src/service.ts", additions: 2, deletions: 0, patch: CORE_PATCH },
  { path: "src/index.ts", additions: 1, deletions: 0, patch: WIRING_PATCH },
  { path: "pnpm-lock.yaml", additions: 900, deletions: 20, patch: LOCK_PATCH },
];

// The server emits the groups already ordered + already sorted within a group.
const SMART: SmartDiff = {
  groups: [
    {
      role: "core",
      files: [
        {
          path: "src/service.ts",
          pseudocode_summary: "Changed: rateLimit()",
          additions: 2,
          deletions: 0,
          finding_lines: [2],
        },
      ],
    },
    {
      role: "wiring",
      files: [
        { path: "src/index.ts", pseudocode_summary: null, additions: 1, deletions: 0, finding_lines: [] },
      ],
    },
    {
      role: "boilerplate",
      files: [
        { path: "pnpm-lock.yaml", pseudocode_summary: null, additions: 900, deletions: 20, finding_lines: [] },
      ],
    },
  ],
  split_suggestion: { too_big: false, total_lines: 923, proposed_splits: [] },
};

const FINDINGS: DiffFinding[] = [
  {
    id: "f1",
    severity: "CRITICAL",
    title: "Hardcoded Stripe secret key",
    file: "src/service.ts",
    start_line: 2, // the `+const b = 2;` line — RIGHT (new-file) side
  },
];

const INTENT: PrIntentRecord = {
  pr_id: "pr-1",
  intent: "Add rate limiting to the public API endpoints.",
  in_scope: [],
  out_of_scope: [],
  risk_areas: ["Auth surface touched"],
  derived_from: ["pr_body"],
  head_sha: "abc1234",
  provider: "openrouter",
  model: "deepseek/deepseek-v4-flash",
  tokens_full: 100,
  tokens_headers: 20,
  computed_at: "2026-07-13T10:00:00.000Z",
  is_stale: false,
};

function renderViewer(props: Partial<React.ComponentProps<typeof SmartDiffViewer>> = {}) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ prReview, shell }}>
      <SmartDiffViewer
        smart={SMART}
        files={FILES}
        findings={FINDINGS}
        intent={INTENT}
        onOpenFinding={() => {}}
        {...props}
      />
    </NextIntlClientProvider>,
  );
}

describe("SmartDiffViewer", () => {
  it("groups the diff core → wiring → boilerplate with counts, and collapses boilerplate", () => {
    renderViewer();

    const headings = screen.getAllByRole("heading", { level: 3 }).map((h) => h.textContent);
    // The intent header is an h3 too — the group headings follow it, in order.
    expect(headings).toEqual([
      "What this PR is trying to do",
      "Core",
      "Wiring",
      "Boilerplate",
    ]);
    expect(screen.getAllByText("1 files")).toHaveLength(3);

    // The small core + wiring files are expanded: their patch bodies are in the DOM…
    expect(screen.getByText("const b = 2;")).toBeInTheDocument();
    expect(screen.getByText("export * from './service';")).toBeInTheDocument();
    // …while the boilerplate group's file card renders CLOSED: its header is there,
    // its body is not.
    expect(screen.getByText("pnpm-lock.yaml")).toBeInTheDocument();
    expect(screen.queryByText("resolution: {}")).not.toBeInTheDocument();
  });

  // REGRESSION. Collapsing boilerplate hides NOISE; it must never hide a FINDING.
  // Real-world bite: the reviewer's findings land overwhelmingly on `*.test.*` files,
  // which the classifier (correctly) calls boilerplate — so the group-level collapse
  // rule hid every badge on the page, and the feature looked broken end to end.
  it("EXPANDS a flagged file even in the collapsed boilerplate group, and badges it", () => {
    const FLAGGED_LOCK_PATCH = ["@@ -1,1 +1,2 @@", " lockfileVersion: 9", "+  evil: true"].join("\n");
    renderViewer({
      files: [...FILES, { path: "spec.test.ts", additions: 1, deletions: 0, patch: FLAGGED_LOCK_PATCH }],
      smart: {
        ...SMART,
        groups: SMART.groups.map((g) =>
          g.role === "boilerplate"
            ? {
                ...g,
                files: [
                  ...g.files,
                  {
                    path: "spec.test.ts",
                    pseudocode_summary: null,
                    additions: 1,
                    deletions: 0,
                    finding_lines: [2],
                  },
                ],
              }
            : g,
        ),
      },
      findings: [
        ...FINDINGS,
        { id: "f2", severity: "WARNING", title: "Weak assertion", file: "spec.test.ts", start_line: 2 },
      ],
    });

    // The UNFLAGGED boilerplate file stays collapsed — the noise-hiding still works…
    expect(screen.queryByText("resolution: {}")).not.toBeInTheDocument();
    // …but the FLAGGED one is open, its line is on screen, and its badge is clickable.
    expect(screen.getByText("evil: true")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /weak assertion/i })).toBeInTheDocument();
    // And the header carries the count, so it is findable even before you look.
    expect(screen.getAllByText("1 finding").length).toBeGreaterThan(0);
  });

  it("renders the intent sentence and risk chips, and omits the header entirely without an intent", () => {
    const { unmount } = renderViewer();
    expect(screen.getByText("Add rate limiting to the public API endpoints.")).toBeInTheDocument();
    expect(screen.getByText("Auth surface touched")).toBeInTheDocument();
    unmount();

    renderViewer({ intent: null });
    expect(screen.queryByText(/what this pr is trying to do/i)).not.toBeInTheDocument();
    expect(screen.queryByText("Auth surface touched")).not.toBeInTheDocument();
  });

  it("badges the flagged line and hands the finding's id to onOpenFinding when clicked", () => {
    const onOpenFinding = vi.fn();
    renderViewer({ onOpenFinding });

    const badge = screen.getByRole("button", { name: /open finding: hardcoded stripe secret key/i });
    fireEvent.click(badge);

    expect(onOpenFinding).toHaveBeenCalledTimes(1);
    expect(onOpenFinding).toHaveBeenCalledWith("f1");
  });

  it("renders a PR with no review: grouped diff, no badges, no crash", () => {
    renderViewer({ findings: [] });

    expect(screen.getByRole("heading", { name: "Core" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /open finding/i })).not.toBeInTheDocument();
  });

  it("shows the split advisory only when the PR is too big", () => {
    renderViewer();
    expect(screen.queryByRole("note")).not.toBeInTheDocument();

    cleanup();
    renderViewer({
      smart: { ...SMART, split_suggestion: { too_big: true, total_lines: 923, proposed_splits: [] } },
    });
    expect(within(screen.getByRole("note")).getByText(/this pr is large/i)).toBeInTheDocument();
  });
});
