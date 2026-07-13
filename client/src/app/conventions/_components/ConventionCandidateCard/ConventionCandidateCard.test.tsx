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
  evidence_sha: "a1b2c3d4e5f6",
  confidence: 0.91,
  accepted: false,
};

function renderCard(props: Partial<React.ComponentProps<typeof ConventionCandidateCard>> = {}) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ conventions: messages }}>
      <ConventionCandidateCard
        candidate={CANDIDATE}
        repoFullName="acme/payments-api"
        onAccept={() => {}}
        onReject={() => {}}
        {...props}
      />
    </NextIntlClientProvider>,
  );
}

/** Open the inline editor by clicking the rule text, then return the textarea. */
function openEditor() {
  fireEvent.click(screen.getByText(CANDIDATE.rule));
  return screen.getByRole("textbox");
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

  // -- inline edit ----------------------------------------------------------

  describe("inline edit", () => {
    it("opens a textarea prefilled with the rule when the text is clicked", () => {
      renderCard();
      expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
      expect(openEditor()).toHaveValue(CANDIDATE.rule);
    });

    it("saves the edited rule via onEditRule and closes the editor", () => {
      const onEditRule = vi.fn();
      renderCard({ onEditRule });
      fireEvent.change(openEditor(), { target: { value: "Prefer async/await" } });
      fireEvent.click(screen.getByRole("button", { name: /save/i }));

      expect(onEditRule).toHaveBeenCalledWith("Prefer async/await");
      expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
    });

    it("does not save an unchanged or blank rule", () => {
      const onEditRule = vi.fn();
      renderCard({ onEditRule });
      fireEvent.change(openEditor(), { target: { value: "   " } });
      // Blank disables Save outright, so the rule can't be emptied (the server rejects it).
      expect(screen.getByRole("button", { name: /save/i })).toBeDisabled();
      expect(onEditRule).not.toHaveBeenCalled();
    });

    it("discards the draft on Cancel", () => {
      const onEditRule = vi.fn();
      renderCard({ onEditRule });
      fireEvent.change(openEditor(), { target: { value: "throwaway" } });
      fireEvent.click(screen.getByRole("button", { name: /cancel/i }));

      expect(onEditRule).not.toHaveBeenCalled();
      expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
      expect(screen.getByText(CANDIDATE.rule)).toBeInTheDocument();
    });

    it("discards the draft on Escape", () => {
      const onEditRule = vi.fn();
      renderCard({ onEditRule });
      const box = openEditor();
      fireEvent.change(box, { target: { value: "throwaway" } });
      fireEvent.keyDown(box, { key: "Escape" });

      expect(onEditRule).not.toHaveBeenCalled();
      expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
    });

    it("saves on Cmd/Ctrl+Enter", () => {
      const onEditRule = vi.fn();
      renderCard({ onEditRule });
      const box = openEditor();
      fireEvent.change(box, { target: { value: "Prefer async/await" } });
      fireEvent.keyDown(box, { key: "Enter", metaKey: true });

      expect(onEditRule).toHaveBeenCalledWith("Prefer async/await");
    });
  });

  // -- evidence deep-link ---------------------------------------------------

  describe("evidence link", () => {
    it("links the evidence path to the blob at the scanned commit and line range", () => {
      renderCard();
      const link = screen.getByRole("link", { name: "src/api/users.ts:23-25" });
      expect(link).toHaveAttribute(
        "href",
        "https://github.com/acme/payments-api/blob/a1b2c3d4e5f6/src/api/users.ts#L23-L25",
      );
      expect(link).toHaveAttribute("target", "_blank");
      expect(link).toHaveAttribute("rel", "noopener noreferrer");
    });

    it("renders the path as plain text when the candidate has no scanned sha", () => {
      // Pre-existing rows (extracted before the sha was recorded) must not produce a
      // link — a link pinned to the wrong commit would cite the wrong lines.
      renderCard({ candidate: { ...CANDIDATE, evidence_sha: null } });
      expect(screen.queryByRole("link")).not.toBeInTheDocument();
      expect(screen.getByText("src/api/users.ts:23-25")).toBeInTheDocument();
    });

    it("renders the path as plain text when the repo isn't loaded yet", () => {
      renderCard({ repoFullName: null });
      expect(screen.queryByRole("link")).not.toBeInTheDocument();
    });
  });
});
