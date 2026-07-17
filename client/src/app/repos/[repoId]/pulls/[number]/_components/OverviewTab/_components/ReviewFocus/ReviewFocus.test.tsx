import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { FindingRecord } from "@devdigest/shared";
import messages from "../../../../../../../../../../messages/en/brief.json";
import { ReviewFocus } from "./ReviewFocus";

afterEach(cleanup);

function finding(
  over: Partial<FindingRecord> & Pick<FindingRecord, "id" | "title" | "file" | "start_line">,
): FindingRecord {
  return {
    review_id: "rev-1",
    severity: "WARNING",
    category: "bug",
    end_line: over.start_line,
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
  finding({ id: "f1", title: "live Stripe key committed in plaintext", file: "src/config.ts", start_line: 12 }),
  finding({ id: "f2", title: "callback_url forwards the account token", file: "src/webhooks.ts", start_line: 61 }),
  finding({ id: "f3", title: "N+1 query", file: "src/users.ts", start_line: 46, end_line: 48 }),
];

function renderReviewFocus(props: Partial<React.ComponentProps<typeof ReviewFocus>> = {}) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ brief: messages }}>
      <ReviewFocus findings={FINDINGS} onOpenFile={() => {}} {...props} />
    </NextIntlClientProvider>,
  );
}

describe("ReviewFocus", () => {
  it("lists every finding in order with its title as the reason", () => {
    renderReviewFocus();

    expect(screen.getByText("src/config.ts:12")).toBeInTheDocument();
    expect(screen.getByText("src/webhooks.ts:61")).toBeInTheDocument();
    // multi-line finding renders a range
    expect(screen.getByText("src/users.ts:46-48")).toBeInTheDocument();
    expect(screen.getByText("live Stripe key committed in plaintext")).toBeInTheDocument();

    const rows = screen.getAllByRole("listitem");
    expect(rows).toHaveLength(3);
    expect(rows[0]).toHaveTextContent("src/config.ts:12");
  });

  it("reveals the file when its link is clicked", () => {
    const onOpenFile = vi.fn();
    renderReviewFocus({ onOpenFile });

    fireEvent.click(screen.getByRole("button", { name: "src/webhooks.ts:61" }));
    expect(onOpenFile).toHaveBeenCalledWith("src/webhooks.ts");
  });

  it("renders nothing when there are no findings", () => {
    const { container } = renderReviewFocus({ findings: [] });
    expect(container).toBeEmptyDOMElement();
  });
});
