import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { ContextDocContent, ContextDocList } from "@devdigest/shared";
import messages from "../../../../../messages/en/projectContext.json";

// AppShell pulls in the full frame (repos hooks, command palette) — stub it to a
// passthrough so we test the page content, not the chrome.
vi.mock("@/components/app-shell", () => ({
  AppShell: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

// Active repo, discovery list, and lazy content hook are the boundaries; drive them per test.
const repo = { repoId: "repo-1" as string | null };
vi.mock("@/lib/repo-context", () => ({
  useActiveRepo: () => ({ repoId: repo.repoId }),
}));

const query = { data: undefined as ContextDocList | undefined, isLoading: false, isError: false };
const content = { data: undefined as ContextDocContent | undefined, isLoading: false, isError: false };
vi.mock("@/lib/hooks/context-docs", () => ({
  useContextDocs: () => ({ ...query, refetch: vi.fn() }),
  useContextDocContent: () => content,
}));

import { ProjectContextView } from "./ProjectContextView";

afterEach(() => {
  cleanup();
  repo.repoId = "repo-1";
  query.data = undefined;
  query.isLoading = false;
  query.isError = false;
  content.data = undefined;
  content.isLoading = false;
  content.isError = false;
});

const LIST: ContextDocList = {
  token_budget: 8000,
  docs: [
    { path: "specs/public-api.md", root: "specs", tokens: 178, used_by_agents: 2, used_by_skills: 0 },
    { path: "docs/rate-limits.md", root: "docs", tokens: 96, used_by_agents: 0, used_by_skills: 1 },
    { path: "insights/postmortem.md", root: "insights", tokens: 512, used_by_agents: 1, used_by_skills: 0 },
  ],
};

// Body chosen so Preview (rendered) and Edit (raw) are distinguishable: the heading
// marker `#` is stripped when rendered, but present verbatim in the raw source.
const BODY = "# Api Contract\n\nThe **api** module must not import db.";

function renderView() {
  return render(
    <NextIntlClientProvider locale="en" messages={{ projectContext: messages }}>
      <ProjectContextView />
    </NextIntlClientProvider>,
  );
}

describe("ProjectContextView (two-pane)", () => {
  it("filters rows by path substring without a refetch, non-destructively (AC-5)", () => {
    query.data = LIST;
    renderView();

    // The list rows show the bold filename (basename), not the full path.
    expect(screen.getByText("public-api.md")).toBeInTheDocument();
    expect(screen.getByText("rate-limits.md")).toBeInTheDocument();
    expect(screen.getByText("postmortem.md")).toBeInTheDocument();

    // Filter matches on the full repo-relative path.
    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "rate" } });
    expect(screen.getByText("rate-limits.md")).toBeInTheDocument();
    expect(screen.queryByText("public-api.md")).not.toBeInTheDocument();
    expect(screen.queryByText("postmortem.md")).not.toBeInTheDocument();

    // Non-destructive: clearing restores every row.
    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "" } });
    expect(screen.getByText("public-api.md")).toBeInTheDocument();
    expect(screen.getByText("postmortem.md")).toBeInTheDocument();
  });

  it("selecting a row previews the rendered body, and Edit shows the raw source read-only (AC-6)", () => {
    query.data = LIST;
    content.data = { path: "specs/public-api.md", body: BODY };
    renderView();

    // Right pane starts on a neutral placeholder (nothing selected).
    expect(screen.getByText(/Select a document/i)).toBeInTheDocument();

    // Select the first document.
    fireEvent.click(screen.getByRole("button", { name: /public-api\.md/ }));

    // Header shows the "Used by N agents" count (AC-4) drawn from the list row.
    expect(screen.getByText("Used by 2 agents")).toBeInTheDocument();

    // Header also shows the token count and the full repo-relative path (AC-6): the
    // list row shows only the bare filename, so these are unique to the preview pane.
    expect(screen.getByText("178 tokens")).toBeInTheDocument();
    expect(screen.getByText("specs/public-api.md")).toBeInTheDocument();

    // Preview tab (default) renders the markdown body — the `#` heading becomes an <h1>.
    expect(screen.getByRole("heading", { name: "Api Contract" })).toBeInTheDocument();

    // Switch to Edit: raw markdown source (heading marker intact), read-only field.
    fireEvent.click(screen.getByRole("button", { name: "Edit" }));
    const raw = screen.getByLabelText("Raw markdown source (read-only)");
    expect(raw).toHaveValue(BODY);
    // Rendered heading is gone once we leave Preview.
    expect(screen.queryByRole("heading", { name: "Api Contract" })).not.toBeInTheDocument();
  });

  it("renders the empty state (not an error) when the repo has no documents (AC-2)", () => {
    query.data = { token_budget: 8000, docs: [] };
    renderView();

    expect(screen.getByText("No project-context documents")).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.queryByRole("searchbox")).not.toBeInTheDocument();
  });
});
