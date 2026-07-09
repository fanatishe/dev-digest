import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { PopoverFinding } from "@devdigest/ui";
import messages from "../../../messages/en/prReview.json";
import { FindingsSeverityCounts } from "./FindingsSeverityCounts";

afterEach(cleanup);

const PREVIEW: PopoverFinding[] = [
  {
    id: "f1",
    severity: "CRITICAL",
    title: "Hardcoded Stripe secret key",
    file: "src/config.ts",
    start_line: 12,
    confidence: 0.98,
    rationale: "A literal sk_live_ secret is committed.",
  },
  {
    id: "f2",
    severity: "WARNING",
    title: "N+1 query in user list endpoint",
    file: "src/api/users.ts",
    start_line: 45,
    confidence: 0.86,
    rationale: "The loop calls findMany once per user.",
  },
];

function renderWithIntl(ui: React.ReactElement) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ prReview: messages }}>
      {ui}
    </NextIntlClientProvider>,
  );
}

describe("FindingsSeverityCounts", () => {
  it("renders a muted dash when there are no findings", () => {
    renderWithIntl(
      <FindingsSeverityCounts
        counts={{ CRITICAL: 0, WARNING: 0, SUGGESTION: 0 }}
        preview={[]}
        onSelectSeverity={() => {}}
      />,
    );
    expect(screen.getByText("—")).toBeInTheDocument();
  });

  it("renders each severity count and calls onSelectSeverity on chip click", () => {
    const onSelect = vi.fn();
    renderWithIntl(
      <FindingsSeverityCounts
        counts={{ CRITICAL: 2, WARNING: 1, SUGGESTION: 0 }}
        preview={PREVIEW}
        onSelectSeverity={onSelect}
      />,
    );
    // Active severities carry the filter label; the zero one is disabled.
    fireEvent.click(screen.getByLabelText("Show only Critical findings"));
    expect(onSelect).toHaveBeenCalledWith("CRITICAL");

    const suggestion = screen.queryByLabelText("Show only Suggestion findings");
    expect(suggestion).not.toBeInTheDocument();
  });

  it("reveals the finding list on hover", () => {
    const { container } = renderWithIntl(
      <FindingsSeverityCounts
        counts={{ CRITICAL: 1, WARNING: 1, SUGGESTION: 0 }}
        preview={PREVIEW}
        onSelectSeverity={() => {}}
      />,
    );
    // Popover content is hidden until hover.
    expect(screen.queryByText("Hardcoded Stripe secret key")).not.toBeInTheDocument();
    fireEvent.mouseEnter(container.firstChild as Element); // the popover wrapper
    expect(screen.getByText("Hardcoded Stripe secret key")).toBeInTheDocument();
    expect(screen.getByText("N+1 query in user list endpoint")).toBeInTheDocument();
    expect(screen.getByText(/2 findings/i)).toBeInTheDocument();
  });
});
