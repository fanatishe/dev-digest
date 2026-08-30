/* EvalsPanel — the shared, owner-agnostic panel rendered by both editor Evals tabs.

   Covers the WP-F acceptance points:
   - renders each case's pass/fail verdict + the imported ReproRateBadge from mocked
     cases;
   - agent mode (allowFromFinding, showDashboardLink) shows the "View full dashboard"
     link; skill mode (allowFromFinding=false, no link) shows "New eval case" and NO
     dashboard link — the ONE shared panel, owner-parameterized (AC-18);
   - zero cases → empty state, no throw (AC-27).

   The `eval` AND `agents` namespaces are both provided: the panel reads `agents`
   (`evalsPanel.*`) while the imported ExpectationBadge/ReproRateBadge read `eval`;
   next-intl throws on a missing key within a present namespace (client INSIGHTS
   2026-07-17). Interactions use `fireEvent` — `@testing-library/user-event` is not
   installed in this repo. */
import React from "react";
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { EvalCaseWithRuns, EvalRunRecord } from "@devdigest/shared";
import agents from "../../../../messages/en/agents.json";
import evalMessages from "../../../../messages/en/eval.json";
import { ConfirmProvider } from "@/lib/confirm";

// next/link needs the app-router context — render a plain anchor in tests.
vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={typeof href === "string" ? href : "#"} {...rest}>
      {children}
    </a>
  ),
}));

// The panel's only data boundary — drive `useEvalCases` per test; the rest are inert.
const casesState = {
  data: undefined as EvalCaseWithRuns[] | undefined,
  isLoading: false,
  isError: false,
};
const runMutateAsync = vi.fn().mockResolvedValue([]);
const batchMutateAsync = vi.fn().mockResolvedValue({});
vi.mock("@/lib/hooks/evals", () => ({
  useEvalCases: () => ({ ...casesState, refetch: vi.fn() }),
  useRunCase: () => ({ mutate: vi.fn(), mutateAsync: runMutateAsync, isPending: false }),
  useBatchFromLatest: () => ({ mutate: vi.fn(), mutateAsync: batchMutateAsync, isPending: false }),
  useDeleteEvalCase: () => ({ mutate: vi.fn(), isPending: false }),
  useCreateEvalCase: () => ({ mutateAsync: vi.fn(), isPending: false, isError: false }),
  useUpdateEvalCase: () => ({ mutateAsync: vi.fn(), isPending: false, isError: false }),
  useCaseRuns: () => ({ data: [] }),
}));

import { EvalsPanel } from "./EvalsPanel";

afterEach(() => {
  cleanup();
  casesState.data = undefined;
  casesState.isLoading = false;
  casesState.isError = false;
});

function run(pass: boolean): EvalRunRecord {
  return {
    id: `run-${pass}`,
    case_id: "c1",
    ran_at: "2026-07-18T10:00:00.000Z",
    actual_output: null,
    pass,
    recall: pass ? 0.9 : 0.4,
    precision: 0.85,
    citation_accuracy: 0.8,
    duration_ms: 120,
    cost_usd: null,
  };
}

function evalCase(id: string, pass: boolean): EvalCaseWithRuns {
  return {
    id,
    owner_kind: "agent",
    owner_id: "ag1",
    name: `case ${id}`,
    input_diff: "",
    input_files: null,
    input_meta: null,
    expected_output: {
      expectations: [{ kind: "must_find", file: "src/a.ts", start_line: 10, end_line: 12 }],
    },
    notes: null,
    last_run: run(pass),
    repro: { passed: pass ? 5 : 2, total: 5, ratio: pass ? 1 : 0.4, reliable: pass },
  };
}

function renderPanel(ui: React.ReactElement) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ agents, eval: evalMessages }}>
      <ConfirmProvider>{ui}</ConfirmProvider>
    </NextIntlClientProvider>,
  );
}

describe("EvalsPanel", () => {
  it("renders pass/fail + the ReproRateBadge, and (agent mode) the dashboard link (AC-18)", () => {
    casesState.data = [evalCase("c1", true), evalCase("c2", false)];
    renderPanel(
      <EvalsPanel owner={{ kind: "agent", id: "ag1" }} allowFromFinding showDashboardLink />,
    );

    // Each case's verdict is text, not colour alone.
    expect(screen.getByText("passed")).toBeInTheDocument();
    expect(screen.getByText("failed")).toBeInTheDocument();
    // The reproduction badges render N/M for both cases.
    expect(screen.getByText("5/5")).toBeInTheDocument();
    expect(screen.getByText("2/5")).toBeInTheDocument();
    // Agent mode with showDashboardLink → the dashboard link points at /eval/:id.
    expect(
      screen.getByRole("link", { name: /view full dashboard/i }),
    ).toHaveAttribute("href", "/eval/ag1");
    // "New eval case" opens the blank-create modal (present in both modes).
    expect(screen.getByRole("button", { name: /new eval case/i })).toBeInTheDocument();
  });

  it("skill mode (allowFromFinding=false, no link) shows New eval case but NO dashboard link (AC-18)", () => {
    casesState.data = [evalCase("c1", true)];
    renderPanel(<EvalsPanel owner={{ kind: "skill", id: "sk1" }} allowFromFinding={false} />);

    expect(screen.getByRole("button", { name: /new eval case/i })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /view full dashboard/i })).not.toBeInTheDocument();
    // Run-all is an agents-only affordance — absent for a skill owner.
    expect(screen.queryByRole("button", { name: /run all evals/i })).not.toBeInTheDocument();
  });

  it("'Run all evals' runs each case ONCE (visual cascade), then rolls them into one dashboard batch", async () => {
    runMutateAsync.mockClear();
    batchMutateAsync.mockClear();
    casesState.data = [evalCase("c1", true), evalCase("c2", false)];
    renderPanel(<EvalsPanel owner={{ kind: "agent", id: "ag1" }} allowFromFinding showDashboardLink />);

    fireEvent.click(screen.getByRole("button", { name: /run all evals/i }));

    // Each case runs once (like clicking each row's Run) …
    await waitFor(() => expect(runMutateAsync).toHaveBeenCalledTimes(2));
    expect(runMutateAsync).toHaveBeenCalledWith({ caseId: "c1", times: 1 });
    expect(runMutateAsync).toHaveBeenCalledWith({ caseId: "c2", times: 1 });
    // … then all of them are aggregated into ONE dashboard batch (the "All (N)" trend point).
    await waitFor(() => expect(batchMutateAsync).toHaveBeenCalledWith(["c1", "c2"]));
  });

  it("renders an empty state (no throw) when the owner has zero cases (AC-27)", () => {
    casesState.data = [];
    expect(() =>
      renderPanel(<EvalsPanel owner={{ kind: "skill", id: "sk1" }} allowFromFinding={false} />),
    ).not.toThrow();
    expect(screen.getByText(/no eval cases yet/i)).toBeInTheDocument();
  });
});
