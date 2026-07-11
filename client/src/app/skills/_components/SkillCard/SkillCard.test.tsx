import { describe, it, expect, afterEach, vi, beforeEach } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { Skill } from "@devdigest/shared";
import messages from "../../../../../messages/en/skills.json";
import { ConfirmProvider } from "@/lib/confirm";
import { SkillCard } from "./SkillCard";

const push = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, replace: vi.fn() }),
}));

const del = vi.fn(() => Promise.resolve({ ok: true }));
vi.mock("@/lib/hooks/skills", () => ({
  useDeleteSkill: () => ({ mutateAsync: del, isPending: false }),
  useUpdateSkill: () => ({ mutate: vi.fn(), isPending: false }),
}));

beforeEach(() => {
  push.mockClear();
  del.mockClear();
});
afterEach(cleanup);

const SKILL: Skill = {
  id: "sk1",
  name: "no-then-chains",
  description: "Ban .then() chains; require async/await.",
  type: "convention",
  source: "manual",
  body: "# Rule",
  enabled: true,
  version: 1,
  evidence_files: null,
};

function renderWithIntl(ui: React.ReactElement) {
  const qc = new QueryClient();
  return render(
    <QueryClientProvider client={qc}>
      <NextIntlClientProvider locale="en" messages={{ skills: messages }}>
        <ConfirmProvider>{ui}</ConfirmProvider>
      </NextIntlClientProvider>
    </QueryClientProvider>,
  );
}

describe("SkillCard (smoke)", () => {
  it("renders the name, description and type badge", () => {
    renderWithIntl(<SkillCard skill={SKILL} />);
    expect(screen.getByText("no-then-chains")).toBeInTheDocument();
    expect(screen.getByText("Ban .then() chains; require async/await.")).toBeInTheDocument();
    expect(screen.getByText("convention")).toBeInTheDocument();
  });

  it("shows a needs-vetting badge for an unvetted imported skill", () => {
    renderWithIntl(<SkillCard skill={{ ...SKILL, source: "community", enabled: false }} />);
    expect(screen.getByText("needs vetting")).toBeInTheDocument();
  });

  it("does NOT show needs-vetting for a manual skill", () => {
    renderWithIntl(<SkillCard skill={SKILL} />);
    expect(screen.queryByText("needs vetting")).not.toBeInTheDocument();
  });

  it("deletes the skill and, when it is the open one, navigates to /skills", async () => {
    renderWithIntl(<SkillCard skill={SKILL} active />);

    fireEvent.click(screen.getByLabelText("Delete skill"));
    fireEvent.click(await screen.findByRole("button", { name: "Delete" }));

    await waitFor(() => expect(del).toHaveBeenCalledWith("sk1"));
    await waitFor(() => expect(push).toHaveBeenCalledWith("/skills"));
  });

  it("does NOT navigate when deleting a skill that is not open", async () => {
    renderWithIntl(<SkillCard skill={SKILL} />);

    fireEvent.click(screen.getByLabelText("Delete skill"));
    fireEvent.click(await screen.findByRole("button", { name: "Delete" }));

    await waitFor(() => expect(del).toHaveBeenCalledWith("sk1"));
    expect(push).not.toHaveBeenCalled();
  });
});
