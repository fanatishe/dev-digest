import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { FindingRecord } from "@devdigest/shared";
import messages from "../../../../../../../../../../messages/en/brief.json";
import { RiskAreas } from "./RiskAreas";

afterEach(cleanup);

function finding(
  over: Partial<FindingRecord> & Pick<FindingRecord, "id" | "title" | "severity">,
): FindingRecord {
  return {
    review_id: "rev-1",
    category: "bug",
    file: "src/x.ts",
    start_line: 1,
    end_line: 1,
    rationale: "",
    suggestion: null,
    confidence: 0.9,
    kind: "finding",
    trifecta_components: null,
    evidence: null,
    accepted_at: null,
    dismissed_at: null,
    ...over,
  };
}

const FINDINGS: FindingRecord[] = [
  finding({
    id: "f1",
    title: "Auth surface touched",
    severity: "CRITICAL",
    category: "security",
    file: "src/auth.ts",
    start_line: 12,
    end_line: 18,
    rationale: "The rate-limit middleware runs before auth on every public route.",
    suggestion: "Move the limiter after the auth guard.",
  }),
  finding({
    id: "f2",
    title: "N+1 query",
    severity: "WARNING",
    category: "perf",
    file: "src/users.ts",
    start_line: 46,
    end_line: 46,
    rationale: "One posts lookup per user under the new limiter.",
  }),
];

function renderRiskAreas(props: Partial<React.ComponentProps<typeof RiskAreas>> = {}) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ brief: messages }}>
      <RiskAreas findings={FINDINGS} intentRisks={[]} onOpenFile={() => {}} {...props} />
    </NextIntlClientProvider>,
  );
}

describe("RiskAreas", () => {
  it("renders one block per finding, a count badge, and no open detail initially", () => {
    renderRiskAreas();

    expect(screen.getByText("2 risks")).toBeInTheDocument();
    // the block body button carries the finding's file:line
    expect(screen.getByRole("button", { name: /src\/auth\.ts:12-18/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /src\/users\.ts:46/ })).toBeInTheDocument();
    // nothing expanded → no detail region, rationale hidden
    expect(screen.queryByText(/runs before auth/i)).not.toBeInTheDocument();
    expect(screen.queryByRole("region")).not.toBeInTheDocument();
  });

  it("chevron opens ONE detail panel below; selecting another swaps it (accordion)", () => {
    renderRiskAreas();

    fireEvent.click(screen.getByRole("button", { name: /toggle details for auth surface touched/i }));
    expect(screen.getByText(/runs before auth/i)).toBeInTheDocument();
    expect(screen.getByText(/move the limiter after the auth guard/i)).toBeInTheDocument();

    // opening the second collapses the first — only one detail at a time
    fireEvent.click(screen.getByRole("button", { name: /toggle details for n\+1 query/i }));
    expect(screen.getByText(/one posts lookup per user/i)).toBeInTheDocument();
    expect(screen.queryByText(/runs before auth/i)).not.toBeInTheDocument();
  });

  it("clicking a block body opens the file in the diff (never expands it)", () => {
    const onOpenFile = vi.fn();
    renderRiskAreas({ onOpenFile });

    fireEvent.click(screen.getByRole("button", { name: /src\/auth\.ts:12-18/ }));
    expect(onOpenFile).toHaveBeenCalledWith("src/auth.ts");
    // the body click navigates, it does not open the detail panel
    expect(screen.queryByText(/runs before auth/i)).not.toBeInTheDocument();
  });

  it("the detail panel's file:line link also opens the file", () => {
    const onOpenFile = vi.fn();
    renderRiskAreas({ onOpenFile });

    fireEvent.click(screen.getByRole("button", { name: /toggle details for auth surface touched/i }));
    const region = screen.getByRole("region", { name: "Auth surface touched" });
    fireEvent.click(within(region).getByRole("button", { name: /src\/auth\.ts:12-18/ }));
    expect(onOpenFile).toHaveBeenCalledWith("src/auth.ts");
  });

  it("with no findings, shows the intent chips fallback and NO generate button", () => {
    renderRiskAreas({
      findings: [],
      intentRisks: ["Auth surface touched", "New dependency: ioredis"],
    });

    expect(screen.getByText("Auth surface touched")).toBeInTheDocument();
    expect(screen.getByText("New dependency: ioredis")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /generate/i })).not.toBeInTheDocument();
    expect(screen.getByText(/run a review to surface/i)).toBeInTheDocument();
  });
});
