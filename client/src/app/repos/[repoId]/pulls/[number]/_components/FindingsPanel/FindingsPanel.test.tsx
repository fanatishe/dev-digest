import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { FindingRecord } from "@devdigest/shared";
import messages from "../../../../../../../../messages/en/prReview.json";

vi.mock("../../../../../../../lib/hooks/reviews", () => ({
  useFindingAction: () => ({ mutate: vi.fn(), isPending: false }),
}));

import { FindingsPanel } from "./FindingsPanel";

afterEach(cleanup);

function finding(o: Partial<FindingRecord> & { id: string }): FindingRecord {
  return {
    severity: "CRITICAL",
    category: "security",
    title: "Hardcoded secret",
    file: "src/config.ts",
    start_line: 11,
    end_line: 11,
    rationale: "A secret is committed.",
    suggestion: null,
    confidence: 0.95,
    kind: "finding",
    trifecta_components: null,
    evidence: null,
    review_id: "r1",
    accepted_at: null,
    dismissed_at: null,
    ...o,
  };
}

const FINDINGS: FindingRecord[] = [finding({ id: "f1" })];

function renderWithIntl(ui: React.ReactElement) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ prReview: messages }}>
      {ui}
    </NextIntlClientProvider>,
  );
}

describe("FindingsPanel (smoke)", () => {
  it("renders the toolbar + a finding card", () => {
    renderWithIntl(<FindingsPanel findings={FINDINGS} prId="pr1" />);
    expect(screen.getByText("Hide low confidence")).toBeInTheDocument();
    expect(screen.getByText("Hardcoded secret")).toBeInTheDocument();
  });

  it("shows the empty state when nothing matches", () => {
    renderWithIntl(<FindingsPanel findings={[]} prId="pr1" />);
    expect(screen.getByText("No findings match")).toBeInTheDocument();
  });

  it("keeps only the requested severity when the severity filter is set", () => {
    const mixed: FindingRecord[] = [
      finding({ id: "f1", severity: "CRITICAL", title: "Critical one" }),
      finding({ id: "f2", severity: "WARNING", title: "Warning one" }),
    ];
    renderWithIntl(<FindingsPanel findings={mixed} prId="pr1" severity="WARNING" />);
    expect(screen.getByText("Warning one")).toBeInTheDocument();
    expect(screen.queryByText("Critical one")).not.toBeInTheDocument();
  });

  it("expands a revealed finding that isn't the default-open first card", () => {
    Element.prototype.scrollIntoView = vi.fn();
    const list: FindingRecord[] = [
      finding({ id: "f1", severity: "CRITICAL", title: "First" }),
      finding({ id: "f2", severity: "WARNING", title: "Second", rationale: "second rationale here" }),
    ];
    renderWithIntl(
      <FindingsPanel findings={list} prId="pr1" revealFindingId="f2" revealNonce={1} />,
    );
    // f2 sorts after f1 (not default-open) but the reveal expands its body.
    expect(screen.getByText("second rationale here")).toBeInTheDocument();
  });

  it("force-includes a revealed finding a severity filter would otherwise hide", () => {
    Element.prototype.scrollIntoView = vi.fn();
    const list: FindingRecord[] = [
      finding({ id: "f1", severity: "CRITICAL", title: "Crit only" }),
      finding({ id: "f2", severity: "WARNING", title: "Warn hidden" }),
    ];
    renderWithIntl(
      <FindingsPanel
        findings={list}
        prId="pr1"
        severity="CRITICAL"
        revealFindingId="f2"
        revealNonce={1}
      />,
    );
    expect(screen.getByText("Warn hidden")).toBeInTheDocument();
  });
});
