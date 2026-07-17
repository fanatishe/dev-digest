import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { RunTrace } from "@devdigest/shared";
import runs from "../../../../../../../../../../messages/en/runs.json";
import projectContext from "../../../../../../../../../../messages/en/projectContext.json";
import { TraceBody } from "./TraceBody";

afterEach(cleanup);

const SPECS_BLOCK =
  "## Project context\n### specs/public-api.md\n<untrusted source=\"spec:specs/public-api.md\">\nThe api module must not import db directly.\n</untrusted>";

const TRACE: RunTrace = {
  config: { agent: "Security", version: "1", provider: "openai", model: "gpt-4.1", pr: 482, source: "local" },
  stats: {
    duration_ms: 8200,
    tokens_in: 12000,
    tokens_out: 1500,
    cost_usd: 0.06,
    findings: 2,
    grounding: "2/2 passed",
    specs_tokens: 123,
  },
  prompt_assembly: {
    system: "You are a reviewer.",
    specs: SPECS_BLOCK,
    user: "Review PR #482",
  },
  tool_calls: [],
  raw_output: "{}",
  memory_pulled: [],
  specs_read: ["specs/public-api.md"],
  specs_skipped: [{ path: "docs/missing.md", reason: "not_found" }],
  log: [],
};

function renderBody() {
  return render(
    <NextIntlClientProvider locale="en" messages={{ runs, projectContext }}>
      <div data-theme="dark">
        <TraceBody trace={TRACE} findings={[]} />
      </div>
    </NextIntlClientProvider>,
  );
}

describe("TraceBody — Project context (AC-21)", () => {
  it("lists specs read, the specs-token stat, and the skipped doc up front", () => {
    renderBody();

    // Configuration → Specs read (visible without interaction).
    expect(screen.getByText("specs/public-api.md")).toBeInTheDocument();
    // Stats → the new nullish-guarded specs-token stat.
    expect(screen.getByText("PROJECT CTX")).toBeInTheDocument();
    expect(screen.getByText("123")).toBeInTheDocument();
    // Configuration → skipped doc with an explicit reason.
    expect(screen.getByText(/docs\/missing\.md · not found in the reviewed clone/)).toBeInTheDocument();
  });

  it("exposes the assembled ## Project context block, matching prompt_assembly.specs", () => {
    renderBody();

    // Expand the (default-collapsed) Prompt assembly section.
    fireEvent.click(screen.getByText("Prompt assembly"));
    // The Project-context block is present and expandable; open it.
    fireEvent.click(screen.getByText("Project context — attached specs (untrusted)"));

    const block = screen.getByText(/### specs\/public-api\.md/);
    expect(block).toHaveTextContent("## Project context");
    expect(block).toHaveTextContent('<untrusted source="spec:specs/public-api.md">');
  });
});
