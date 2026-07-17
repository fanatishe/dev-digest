import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, within, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { Agent, ContextDocContent, ContextDocList } from "@devdigest/shared";
import messages from "../../../../../../../../messages/en/projectContext.json";

// Boundaries: the agent (for its attached path list), the discovery list, the
// per-doc content read (drawer body), and the setter mutation. Mock all four so the
// tab renders without a query client.
const agent = { data: undefined as Agent | undefined };
vi.mock("@/lib/hooks/agents", () => ({
  useAgent: () => agent,
}));

const list = { data: undefined as ContextDocList | undefined, isLoading: false };
const content = { data: undefined as ContextDocContent | undefined, isLoading: false, isError: false };
const setMutate = vi.fn();
vi.mock("@/lib/hooks/context-docs", () => ({
  useContextDocs: () => list,
  useContextDocContent: () => content,
  useSetAgentContextDocs: () => ({ mutate: setMutate, isPending: false }),
}));

import { ContextTab } from "./ContextTab";

afterEach(() => {
  cleanup();
  agent.data = undefined;
  list.data = undefined;
  list.isLoading = false;
  content.data = undefined;
  content.isError = false;
  setMutate.mockReset();
});

const DOCS: ContextDocList = {
  token_budget: 8000,
  docs: [
    { path: "specs/a.md", root: "specs", tokens: 100, used_by_agents: 2, used_by_skills: 0 },
    { path: "docs/b.md", root: "docs", tokens: 200, used_by_agents: 1, used_by_skills: 0 },
    { path: "insights/c.md", root: "insights", tokens: 50, used_by_agents: 0, used_by_skills: 0 },
  ],
};

const AGENT = { id: "ag1", context_docs: ["specs/a.md", "docs/b.md"] } as unknown as Agent;

function renderTab(budget = 8000) {
  list.data = { ...DOCS, token_budget: budget };
  agent.data = AGENT;
  return render(
    <NextIntlClientProvider locale="en" messages={{ projectContext: messages }}>
      <ContextTab agentId="ag1" repoId="repo-1" />
    </NextIntlClientProvider>,
  );
}

describe("Agent ContextTab", () => {
  it("shows a running token total of the checked docs and the injection label (AC-10)", () => {
    renderTab(8000);

    // 100 (specs/a.md) + 200 (docs/b.md) = 300 checked tokens.
    expect(screen.getByText("≈ 300 tokens")).toBeInTheDocument();
    // States the block injects as untrusted ## Project context.
    expect(screen.getByText("injected as untrusted ## Project context")).toBeInTheDocument();
    // Not over the (large) budget → no alert.
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("renders an over-budget indicator when the checked total exceeds the budget (AC-11)", () => {
    renderTab(250); // 300 > 250

    const alert = screen.getByRole("alert");
    expect(alert).toHaveTextContent(/Over budget/);
    expect(alert).toHaveTextContent(/300/);
    expect(alert).toHaveTextContent(/250/);
  });

  it("opens the preview drawer from a row's eye button and shows the doc overview + rendered body, and the Attached toggle detaches via the same mutation", () => {
    content.data = { path: "specs/a.md", body: "# Public API\n\nThe rules." };
    renderTab(8000);

    // No drawer until the eye is clicked.
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Preview specs/a.md" }));

    const drawer = screen.getByRole("dialog");
    // Header path, root badge, token count and used-by all come from the list row.
    expect(within(drawer).getByText("specs/a.md")).toBeInTheDocument();
    expect(within(drawer).getByText("specs")).toBeInTheDocument();
    expect(within(drawer).getByText("100 tokens")).toBeInTheDocument();
    expect(within(drawer).getByText("Used by 2 agents")).toBeInTheDocument();
    // Rendered markdown body (from the mocked content hook).
    expect(within(drawer).getByRole("heading", { name: "Public API" })).toBeInTheDocument();

    // specs/a.md is attached → toggle shows "Attached" and detaches on click.
    const toggle = within(drawer).getByRole("button", { name: /Attached/ });
    fireEvent.click(toggle);
    expect(setMutate).toHaveBeenCalledWith(["docs/b.md"]);
  });

  it("renders the Serializes as manifest grouped by root, in attached order, for the attached docs (AC-16)", () => {
    renderTab(8000); // attached: specs/a.md, docs/b.md — two roots

    // Section label (rendered uppercase via CSS; the DOM text stays as authored).
    expect(screen.getByText("Serializes as")).toBeInTheDocument();

    // A friendly heading per non-empty group, then the attached docs' repo-relative
    // paths under it — specs group before the docs group (attached order).
    expect(screen.getByText("## Project specifications")).toBeInTheDocument();
    expect(screen.getByText("- specs/a.md")).toBeInTheDocument();
    expect(screen.getByText("## Project docs")).toBeInTheDocument();
    expect(screen.getByText("- docs/b.md")).toBeInTheDocument();

    // insights/c.md is NOT attached → it does not appear in the manifest.
    expect(screen.queryByText("- insights/c.md")).not.toBeInTheDocument();
    expect(screen.queryByText("## Project insights")).not.toBeInTheDocument();
  });

  it("renders a document row as a bold filename followed by the muted folder-path (AC-16)", () => {
    renderTab(8000);

    // specs/a.md → basename bold, leading dir muted (split into two text nodes).
    const name = screen.getByText("a.md");
    expect(name).toHaveStyle({ fontWeight: "700" });
    expect(screen.getByText("specs/")).toBeInTheDocument();
    // The old full-path label is gone — the path is no longer one node.
    expect(screen.queryByText("specs/a.md")).not.toBeInTheDocument();
  });

  it("attaches an available doc from its drawer toggle via the mutation", () => {
    content.data = { path: "insights/c.md", body: "body" };
    renderTab(8000);

    // insights/c.md is in the Available section (not attached).
    fireEvent.click(screen.getByRole("button", { name: "Preview insights/c.md" }));

    const drawer = screen.getByRole("dialog");
    const attach = within(drawer).getByRole("button", { name: "Attach" });
    fireEvent.click(attach);
    expect(setMutate).toHaveBeenCalledWith(["specs/a.md", "docs/b.md", "insights/c.md"]);
  });
});
