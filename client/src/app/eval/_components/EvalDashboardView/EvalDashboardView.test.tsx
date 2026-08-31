import React from "react";
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import type { EvalAgentDashboard, EvalBatch, EvalDashboardRow } from "@devdigest/shared";

// AppShell pulls in the full frame (repo hooks, command palette) — stub it to a
// passthrough so we test the dashboard content, not the chrome (house pattern).
vi.mock("@/components/app-shell", () => ({
  AppShell: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

// next/link needs the app-router context; render it as a plain anchor in tests.
vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={typeof href === "string" ? href : "#"} {...rest}>
      {children}
    </a>
  ),
}));

// The single data boundary — drive it per test.
const dash = {
  data: undefined as EvalAgentDashboard | undefined,
  isLoading: false,
  isError: false,
};
// Run-all mutation + secrets status — driven per test to exercise the key gate.
const runAll = { isPending: false, isError: false, mutate: vi.fn() };
const secrets = {
  data: { openai: false, anthropic: false, openrouter: false } as {
    openai: boolean;
    anthropic: boolean;
    openrouter: boolean;
  },
};
vi.mock("@/lib/hooks/evals", () => ({
  useEvalDashboard: () => ({ ...dash, refetch: vi.fn() }),
  useDashboardRunAll: () => runAll,
}));
vi.mock("@/lib/hooks/core", () => ({
  useSecretsStatus: () => secrets,
}));

import { EvalDashboardView } from "./EvalDashboardView";

afterEach(() => {
  cleanup();
  dash.data = undefined;
  dash.isLoading = false;
  dash.isError = false;
  runAll.isPending = false;
  runAll.isError = false;
  runAll.mutate = vi.fn();
  secrets.data = { openai: false, anthropic: false, openrouter: false };
});

function batch(id: string, version: number): EvalBatch {
  return {
    id,
    workspace_id: "ws1",
    owner_kind: "agent",
    owner_id: "ag1",
    agent_version: version,
    ran_at: "2026-07-15T10:00:00.000Z",
    recall: 0.9,
    precision: 0.85,
    citation_accuracy: 0.75,
    pass_rate: 0.85,
    traces_passed: 17,
    traces_total: 20,
    cases_total: 20,
    cost_usd: null,
    duration_ms: 1200,
  };
}

function agentRow(owner_id: string, name: string, model: string): EvalDashboardRow {
  return {
    owner_id,
    name,
    model,
    agent_version: 6,
    cases_total: 20,
    last_batch: batch(`${owner_id}-b`, 6),
    sparkline: [0.7, 0.75, 0.82, 0.9],
  };
}

describe("EvalDashboardView", () => {
  it("renders AGENT rows from the dashboard and never lists skills (AC-20)", () => {
    dash.data = {
      agents: [
        agentRow("ag1", "Security Reviewer", "gpt-4.1"),
        agentRow("ag2", "Style Bot", "claude-3.5"),
      ],
      recent_batches: [batch("rb1", 6)],
    };
    render(<EvalDashboardView />);

    // Both agents render, each linking to its per-agent detail route.
    expect(screen.getByRole("link", { name: /Security Reviewer/i })).toHaveAttribute(
      "href",
      "/eval/ag1",
    );
    expect(screen.getByRole("link", { name: /Style Bot/i })).toHaveAttribute("href", "/eval/ag2");
    // Model chips render.
    expect(screen.getByText("gpt-4.1")).toBeInTheDocument();
    // Agents-only: nothing skill-related is rendered.
    expect(screen.queryByText(/skill/i)).not.toBeInTheDocument();
    // The last-run pass count is present.
    expect(screen.getAllByText(/17\/20 pass/).length).toBeGreaterThan(0);
  });

  it("renders an empty state (no throw) when there are no agents (AC-27)", () => {
    dash.data = { agents: [], recent_batches: [] };
    expect(() => render(<EvalDashboardView />)).not.toThrow();
    expect(screen.getByText(/no agent evals yet/i)).toBeInTheDocument();
  });

  it("renders a non-throwing error state when the dashboard fails to load (AC-27)", () => {
    dash.isError = true;
    expect(() => render(<EvalDashboardView />)).not.toThrow();
    expect(screen.getByText(/could not load the eval dashboard/i)).toBeInTheDocument();
  });

  it("renders a non-throwing loading state (AC-27)", () => {
    dash.isLoading = true;
    expect(() => render(<EvalDashboardView />)).not.toThrow();
  });

  it("disables 'Run all agents' with a hint when no OpenRouter key is configured (AC-27)", () => {
    dash.data = { agents: [], recent_batches: [] };
    secrets.data = { openai: false, anthropic: false, openrouter: false };
    render(<EvalDashboardView />);

    const btn = screen.getByRole("button", { name: /run all agents/i });
    expect(btn).toBeDisabled();
    expect(btn).toHaveAttribute("title", expect.stringMatching(/openrouter key/i));
  });

  it("enables 'Run all agents' and triggers the run-all when a key is present", () => {
    dash.data = { agents: [], recent_batches: [] };
    secrets.data = { openai: false, anthropic: false, openrouter: true };
    render(<EvalDashboardView />);

    const btn = screen.getByRole("button", { name: /run all agents/i });
    expect(btn).not.toBeDisabled();
    fireEvent.click(btn);
    expect(runAll.mutate).toHaveBeenCalledTimes(1);
  });

  it("shows a non-throwing notice when the live run-all fails (AC-27)", () => {
    dash.data = { agents: [], recent_batches: [] };
    secrets.data = { openai: false, anthropic: false, openrouter: true };
    runAll.isError = true;
    expect(() => render(<EvalDashboardView />)).not.toThrow();
    expect(screen.getByText(/live run failed/i)).toBeInTheDocument();
  });
});
