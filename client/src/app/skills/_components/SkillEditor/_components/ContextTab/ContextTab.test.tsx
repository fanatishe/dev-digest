import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, within, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { Skill, ContextDocContent, ContextDocList } from "@devdigest/shared";
import messages from "../../../../../../../messages/en/projectContext.json";

// Boundaries: the skill (for its attached path list), the discovery list, the per-doc
// content read (drawer body), and the setter mutation. The skill Context tab mirrors
// the agent one on the same contract (AC-9) — only the hooks differ.
const skill = { data: undefined as Skill | undefined };
vi.mock("@/lib/hooks/skills", () => ({
  useSkill: () => skill,
}));

const list = { data: undefined as ContextDocList | undefined, isLoading: false };
const content = { data: undefined as ContextDocContent | undefined, isLoading: false, isError: false };
const setMutate = vi.fn();
vi.mock("@/lib/hooks/context-docs", () => ({
  useContextDocs: () => list,
  useContextDocContent: () => content,
  useSetSkillContextDocs: () => ({ mutate: setMutate, isPending: false }),
}));

import { ContextTab } from "./ContextTab";

afterEach(() => {
  cleanup();
  skill.data = undefined;
  list.data = undefined;
  list.isLoading = false;
  content.data = undefined;
  content.isError = false;
  setMutate.mockReset();
});

const DOCS: ContextDocList = {
  token_budget: 8000,
  docs: [
    { path: "specs/a.md", root: "specs", tokens: 100, used_by_agents: 2, used_by_skills: 1 },
    { path: "docs/b.md", root: "docs", tokens: 200, used_by_agents: 1, used_by_skills: 0 },
    { path: "insights/c.md", root: "insights", tokens: 50, used_by_agents: 0, used_by_skills: 0 },
  ],
};

const SKILL = { id: "sk1", context_docs: ["specs/a.md", "docs/b.md"] } as unknown as Skill;

function renderTab(budget = 8000) {
  list.data = { ...DOCS, token_budget: budget };
  skill.data = SKILL;
  return render(
    <NextIntlClientProvider locale="en" messages={{ projectContext: messages }}>
      <ContextTab skillId="sk1" repoId="repo-1" />
    </NextIntlClientProvider>,
  );
}

describe("Skill ContextTab", () => {
  it("shows a running token total of the checked docs and the injection label (AC-10)", () => {
    renderTab(8000);

    expect(screen.getByText("≈ 300 tokens")).toBeInTheDocument();
    expect(screen.getByText("injected as untrusted ## Project context")).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("opens the preview drawer from a row's eye button and shows the doc overview + rendered body, and the Attached toggle detaches via the same mutation", () => {
    content.data = { path: "specs/a.md", body: "# Public API\n\nThe rules." };
    renderTab(8000);

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Preview specs/a.md" }));

    const drawer = screen.getByRole("dialog");
    expect(within(drawer).getByText("specs/a.md")).toBeInTheDocument();
    expect(within(drawer).getByText("specs")).toBeInTheDocument();
    expect(within(drawer).getByText("100 tokens")).toBeInTheDocument();
    expect(within(drawer).getByText("Used by 2 agents")).toBeInTheDocument();
    expect(within(drawer).getByRole("heading", { name: "Public API" })).toBeInTheDocument();

    const toggle = within(drawer).getByRole("button", { name: /Attached/ });
    fireEvent.click(toggle);
    expect(setMutate).toHaveBeenCalledWith(["docs/b.md"]);
  });

  it("renders the Serializes as manifest grouped by root, in attached order, for the attached docs (AC-16)", () => {
    renderTab(8000); // attached: specs/a.md, docs/b.md — two roots

    expect(screen.getByText("Serializes as")).toBeInTheDocument();

    expect(screen.getByText("## Project specifications")).toBeInTheDocument();
    expect(screen.getByText("- specs/a.md")).toBeInTheDocument();
    expect(screen.getByText("## Project docs")).toBeInTheDocument();
    expect(screen.getByText("- docs/b.md")).toBeInTheDocument();

    expect(screen.queryByText("- insights/c.md")).not.toBeInTheDocument();
    expect(screen.queryByText("## Project insights")).not.toBeInTheDocument();
  });

  it("renders a document row as a bold filename followed by the muted folder-path (AC-16)", () => {
    renderTab(8000);

    const name = screen.getByText("a.md");
    expect(name).toHaveStyle({ fontWeight: "700" });
    expect(screen.getByText("specs/")).toBeInTheDocument();
    expect(screen.queryByText("specs/a.md")).not.toBeInTheDocument();
  });
});
