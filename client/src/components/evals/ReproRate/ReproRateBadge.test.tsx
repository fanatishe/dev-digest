import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { EvalRunRecord } from "@devdigest/shared";
import evalMessages from "../../../../messages/en/eval.json";
import { ReproRateBadge } from "./ReproRateBadge";

afterEach(cleanup);

function run(id: string, pass: boolean): EvalRunRecord {
  return {
    id,
    case_id: "c1",
    case_name: null,
    ran_at: "2026-07-19T00:00:00Z",
    actual_output: null,
    pass,
    recall: pass ? 1 : 0,
    precision: 1,
    citation_accuracy: 1,
    duration_ms: 1200,
    cost_usd: 0.02,
  };
}

function renderWithIntl(ui: React.ReactElement) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ eval: evalMessages }}>
      {ui}
    </NextIntlClientProvider>,
  );
}

describe("ReproRateBadge (AC-14 display)", () => {
  it("marks 4/5 reliable (green) via an accessible label", () => {
    const runs = [run("r1", true), run("r2", true), run("r3", true), run("r4", true), run("r5", false)];
    renderWithIntl(<ReproRateBadge runs={runs} />);
    expect(screen.getByText("4/5")).toBeInTheDocument();
    // Reliability is carried in the label, not colour alone.
    expect(screen.getByLabelText(/reproduces reliably/i)).toBeInTheDocument();
    expect(screen.queryByLabelText(/unstable/i)).not.toBeInTheDocument();
  });

  it("marks 2/5 as not reliable (unstable)", () => {
    const runs = [run("r1", true), run("r2", true), run("r3", false), run("r4", false), run("r5", false)];
    renderWithIntl(<ReproRateBadge runs={runs} />);
    expect(screen.getByText("2/5")).toBeInTheDocument();
    expect(screen.getByLabelText(/unstable/i)).toBeInTheDocument();
    expect(screen.queryByLabelText(/reproduces reliably/i)).not.toBeInTheDocument();
  });

  it("shows a no-runs state instead of dividing by zero", () => {
    renderWithIntl(<ReproRateBadge runs={[]} />);
    expect(screen.getByText("No runs")).toBeInTheDocument();
  });
});
