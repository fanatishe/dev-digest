import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import messages from "../../../../../messages/en/conventions.json";
import type { ScanState } from "@/lib/hooks/conventions";
import { ScanProgress } from "./ScanProgress";

afterEach(cleanup);

function state(over: Partial<ScanState> = {}): ScanState {
  return {
    stages: { sample: "done", analyze: "active", verify: "pending", persist: "pending" },
    lines: [{ t: "12:00:01", msg: "Sampled 12 file(s) from acme/payments-api", kind: "result" }],
    error: null,
    ...over,
  };
}

function renderPanel(scan: ScanState) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ conventions: messages }}>
      <ScanProgress scan={scan} repoName="payments-api" />
    </NextIntlClientProvider>,
  );
}

describe("ScanProgress", () => {
  it("names the repo being scanned and lists every pipeline stage", () => {
    renderPanel(state());
    expect(screen.getByText("Scanning payments-api…")).toBeInTheDocument();
    expect(screen.getByText("Sample files from the clone")).toBeInTheDocument();
    expect(screen.getByText("Analyze with the model")).toBeInTheDocument();
    expect(screen.getByText("Verify evidence")).toBeInTheDocument();
    expect(screen.getByText("Save conventions")).toBeInTheDocument();
  });

  it("shows the server's streamed log lines verbatim", () => {
    renderPanel(state());
    expect(screen.getByText("Sampled 12 file(s) from acme/payments-api")).toBeInTheDocument();
  });

  it("surfaces a scan error on the panel", () => {
    renderPanel(state({ error: "model call failed: 401" }));
    expect(screen.getByText("model call failed: 401")).toBeInTheDocument();
  });

  it("renders an elapsed clock starting at 0:00", () => {
    renderPanel(state());
    expect(screen.getByText("0:00")).toBeInTheDocument();
  });
});
