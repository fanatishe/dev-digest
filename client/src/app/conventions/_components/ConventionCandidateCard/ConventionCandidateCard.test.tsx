import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { ConventionCandidate } from "@devdigest/shared";
import messages from "../../../../../messages/en/conventions.json";
import { ConventionCandidateCard } from "./ConventionCandidateCard";

afterEach(cleanup);

const CANDIDATE: ConventionCandidate = {
  id: "c1",
  rule: "Always use async/await instead of .then() chains",
  evidence_path: "src/api/users.ts:23-25",
  evidence_snippet: "const user = await db.users.find(id);",
  confidence: 0.91,
  accepted: false,
};

function renderCard(props: Partial<React.ComponentProps<typeof ConventionCandidateCard>> = {}) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ conventions: messages }}>
      <ConventionCandidateCard
        candidate={CANDIDATE}
        onAccept={() => {}}
        onReject={() => {}}
        {...props}
      />
    </NextIntlClientProvider>,
  );
}

describe("ConventionCandidateCard", () => {
  it("renders the rule, evidence path, snippet and confidence", () => {
    renderCard();
    expect(screen.getByText(CANDIDATE.rule)).toBeInTheDocument();
    expect(screen.getByText("src/api/users.ts:23-25")).toBeInTheDocument();
    expect(screen.getByText(CANDIDATE.evidence_snippet)).toBeInTheDocument();
    expect(screen.getByText("91%")).toBeInTheDocument();
  });

  it("fires onAccept(true) when an un-accepted candidate's Accept is clicked", () => {
    const onAccept = vi.fn();
    renderCard({ onAccept });
    fireEvent.click(screen.getByRole("button", { name: /accept/i }));
    expect(onAccept).toHaveBeenCalledWith(true);
  });

  it("shows Accepted and toggles back off when already accepted", () => {
    const onAccept = vi.fn();
    renderCard({ candidate: { ...CANDIDATE, accepted: true }, onAccept });
    const btn = screen.getByRole("button", { name: /accepted/i });
    fireEvent.click(btn);
    expect(onAccept).toHaveBeenCalledWith(false);
  });

  it("fires onReject when Reject is clicked", () => {
    const onReject = vi.fn();
    renderCard({ onReject });
    fireEvent.click(screen.getByRole("button", { name: /reject/i }));
    expect(onReject).toHaveBeenCalled();
  });
});
