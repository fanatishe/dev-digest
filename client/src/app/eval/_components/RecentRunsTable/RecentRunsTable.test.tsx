import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import type { EvalBatch } from "@devdigest/shared";
import { RecentRunsTable } from "./RecentRunsTable";

afterEach(cleanup);

function batch(id: string, version: number): EvalBatch {
  return {
    id,
    workspace_id: "ws1",
    owner_kind: "agent",
    owner_id: "ag1",
    agent_version: version,
    ran_at: "2026-07-15T10:00:00.000Z",
    recall: 0.85,
    precision: 0.9,
    citation_accuracy: 0.75,
    pass_rate: 0.8,
    traces_passed: 8,
    traces_total: 10,
    cases_total: 10,
    cost_usd: null,
    duration_ms: 1200,
  };
}

describe("RecentRunsTable — Compare gating (AC-23)", () => {
  it("enables Compare only when EXACTLY two runs are selected, and hands up base/head", () => {
    const onCompare = vi.fn();
    render(
      <RecentRunsTable
        batches={[batch("b1", 6), batch("b2", 7), batch("b3", 8)]}
        onCompare={onCompare}
      />,
    );

    const compare = () => screen.getByRole("button", { name: /compare/i });
    const boxes = screen.getAllByRole("checkbox");
    expect(boxes).toHaveLength(3);

    // 0 selected → disabled.
    expect(compare()).toBeDisabled();

    // 1 selected → still disabled.
    fireEvent.click(boxes[0]!);
    expect(compare()).toBeDisabled();

    // 2 selected → enabled.
    fireEvent.click(boxes[1]!);
    expect(compare()).toBeEnabled();

    // Compare hands up the two batch ids in selection order (base, head).
    fireEvent.click(compare());
    expect(onCompare).toHaveBeenCalledTimes(1);
    expect(onCompare).toHaveBeenCalledWith("b1", "b2");

    // 3 selected → disabled again (a live-run affordance never fires at ≠ 2).
    fireEvent.click(boxes[2]!);
    expect(compare()).toBeDisabled();
    expect(onCompare).toHaveBeenCalledTimes(1);
  });

  it("renders an empty affordance rather than throwing when there are no runs (AC-27)", () => {
    render(<RecentRunsTable batches={[]} onCompare={vi.fn()} />);
    expect(screen.getByText(/no runs in this range/i)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /compare/i })).not.toBeInTheDocument();
  });
});
