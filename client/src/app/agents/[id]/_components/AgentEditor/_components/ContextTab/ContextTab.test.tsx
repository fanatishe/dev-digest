import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { Agent, ContextDocList } from "@devdigest/shared";
import messages from "../../../../../../../../messages/en/projectContext.json";

// Boundaries: the agent (for its attached path list), the discovery list, and the
// setter mutation. Mock all three so the tab renders without a query client.
const agent = { data: undefined as Agent | undefined };
vi.mock("@/lib/hooks/agents", () => ({
  useAgent: () => agent,
}));

const list = { data: undefined as ContextDocList | undefined, isLoading: false };
vi.mock("@/lib/hooks/context-docs", () => ({
  useContextDocs: () => list,
  useSetAgentContextDocs: () => ({ mutate: vi.fn(), isPending: false }),
}));

import { ContextTab } from "./ContextTab";

afterEach(() => {
  cleanup();
  agent.data = undefined;
  list.data = undefined;
  list.isLoading = false;
});

const DOCS: ContextDocList = {
  token_budget: 8000,
  docs: [
    { path: "specs/a.md", root: "specs", tokens: 100, used_by_agents: 1, used_by_skills: 0 },
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
});
