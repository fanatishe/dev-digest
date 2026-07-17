import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { Agent, ContextDocList } from "@devdigest/shared";
import messages from "../../../../../../messages/en/agents.json";
import pcMessages from "../../../../../../messages/en/projectContext.json";
import { ToastProvider } from "../../../../../lib/toast";

// Mock the data hooks so the editor renders without a network/query client.
// `useAgent` feeds the Context tab its persisted attached-path list.
vi.mock("../../../../../lib/hooks/agents", () => ({
  useUpdateAgent: () => ({ mutate: vi.fn(), isPending: false, isSuccess: false, data: undefined }),
  useProviderModels: () => ({ data: [{ id: "gpt-4.1", provider: "openai" }] }),
  useAgent: () => ({ data: { id: "ag1", context_docs: ["specs/a.md"] } }),
}));

const ctxList = { data: undefined as ContextDocList | undefined, isLoading: false };
vi.mock("@/lib/hooks/context-docs", () => ({
  useContextDocs: () => ctxList,
  useSetAgentContextDocs: () => ({ mutate: vi.fn(), isPending: false }),
}));

vi.mock("@/lib/repo-context", () => ({
  useActiveRepo: () => ({ repoId: "repo-1" }),
}));

import { AgentEditor } from "./AgentEditor";

afterEach(() => {
  cleanup();
  ctxList.data = undefined;
});

const AGENT: Agent = {
  id: "ag1",
  name: "Security Reviewer",
  description: "Flags secrets and injection",
  provider: "openai",
  model: "gpt-4.1",
  system_prompt: "You are a security reviewer.",
  output_schema: null,
  strategy: "single-pass",
  ci_fail_on: "critical",
  repo_intel: true,
  enabled: true,
  version: 1,
};

// AgentEditor always resolves the Context tab's label from the `projectContext`
// namespace (regardless of active tab), so both namespaces are always provided.
function renderWithIntl(ui: React.ReactElement) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ agents: messages, projectContext: pcMessages }}>
      <ToastProvider>{ui}</ToastProvider>
    </NextIntlClientProvider>,
  );
}

describe("A2 Agent Editor (smoke)", () => {
  it("renders the Config tab fields", () => {
    renderWithIntl(<AgentEditor agent={AGENT} tab="config" onTab={() => {}} />);
    expect(screen.getByText("Config")).toBeInTheDocument();
    expect(screen.getByText("Configuration")).toBeInTheDocument();
    expect(screen.getByText("Save agent")).toBeInTheDocument();
  });

  // Regression: the Config form resets when a different agent is selected. The
  // reset is driven by `key={agent.id}` on <ConfigTab> (remount re-runs the
  // useState initializers) — NOT a prop→state sync effect. This guards against
  // a local edit leaking across an agent switch.
  it("resets local edits when switching to a different agent", () => {
    const AGENT2: Agent = { ...AGENT, id: "ag2", name: "Perf Reviewer" };
    const { rerender } = renderWithIntl(<AgentEditor agent={AGENT} tab="config" onTab={() => {}} />);

    const nameInput = screen.getByDisplayValue("Security Reviewer");
    fireEvent.change(nameInput, { target: { value: "EDITED NAME" } });
    expect(screen.getByDisplayValue("EDITED NAME")).toBeInTheDocument();

    rerender(
      <NextIntlClientProvider locale="en" messages={{ agents: messages, projectContext: pcMessages }}>
        <ToastProvider>
          <AgentEditor agent={AGENT2} tab="config" onTab={() => {}} />
        </ToastProvider>
      </NextIntlClientProvider>,
    );

    expect(screen.getByDisplayValue("Perf Reviewer")).toBeInTheDocument();
    expect(screen.queryByDisplayValue("EDITED NAME")).not.toBeInTheDocument();
  });

  // Bug A regression: opening the Context tab must render its content, not a blank
  // panel. Two guards live above this component (the `?tab=` allowlist in
  // AgentDetailView, which previously dropped "context") and inside it (every
  // message key the tab references must exist in the `projectContext` namespace —
  // next-intl throws on a missing key within a present namespace, blanking the tab).
  // Providing both namespaces here catches the missing-message class.
  it("mounts the Context tab and renders its attach list + running token total (Bug A)", () => {
    ctxList.data = {
      token_budget: 8000,
      docs: [
        { path: "specs/a.md", root: "specs", tokens: 100, used_by_agents: 1, used_by_skills: 0 },
        { path: "docs/b.md", root: "docs", tokens: 200, used_by_agents: 0, used_by_skills: 0 },
      ],
    };
    render(
      <NextIntlClientProvider locale="en" messages={{ agents: messages, projectContext: pcMessages }}>
        <ToastProvider>
          <AgentEditor agent={AGENT} tab="context" onTab={() => {}} />
        </ToastProvider>
      </NextIntlClientProvider>,
    );

    // Heading + attached row + injection label + derived running total all render.
    expect(screen.getByText("Project context")).toBeInTheDocument();
    expect(screen.getByText("specs/a.md")).toBeInTheDocument();
    expect(screen.getByText("injected as untrusted ## Project context")).toBeInTheDocument();
    expect(screen.getByText("≈ 100 tokens")).toBeInTheDocument();
  });
});
