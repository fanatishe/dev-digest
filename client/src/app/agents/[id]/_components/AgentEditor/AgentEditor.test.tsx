import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { Agent } from "@devdigest/shared";
import messages from "../../../../../../messages/en/agents.json";
import { ToastProvider } from "../../../../../lib/toast";

// Mock the data hooks so the editor renders without a network/query client.
vi.mock("../../../../../lib/hooks/agents", () => ({
  useUpdateAgent: () => ({ mutate: vi.fn(), isPending: false, isSuccess: false, data: undefined }),
  useProviderModels: () => ({ data: [{ id: "gpt-4.1", provider: "openai" }] }),
}));

import { AgentEditor } from "./AgentEditor";

afterEach(cleanup);

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

function renderWithIntl(ui: React.ReactElement) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ agents: messages }}>
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
      <NextIntlClientProvider locale="en" messages={{ agents: messages }}>
        <ToastProvider>
          <AgentEditor agent={AGENT2} tab="config" onTab={() => {}} />
        </ToastProvider>
      </NextIntlClientProvider>,
    );

    expect(screen.getByDisplayValue("Perf Reviewer")).toBeInTheDocument();
    expect(screen.queryByDisplayValue("EDITED NAME")).not.toBeInTheDocument();
  });
});
