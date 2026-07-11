import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";

// RunStatus streams live run state (SSE) — stub it; the banner's own job is the
// conditional section + the cancel / open-trace actions.
vi.mock("../../../RunStatus", () => ({
  RunStatus: () => <div data-testid="run-status" />,
}));

import { LiveReviewBanner } from "./LiveReviewBanner";

afterEach(cleanup);

describe("LiveReviewBanner", () => {
  it("renders nothing when there are no live runs", () => {
    const { container } = render(
      <LiveReviewBanner
        liveRunIds={[]}
        cancelPending={false}
        onCancelAll={() => {}}
        onOpenFirstTrace={() => {}}
        onRunDone={() => {}}
      />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("shows the live section + actions when a run is live, and fires callbacks", () => {
    const onCancelAll = vi.fn();
    const onOpenFirstTrace = vi.fn();
    render(
      <LiveReviewBanner
        liveRunIds={["r1"]}
        cancelPending={false}
        onCancelAll={onCancelAll}
        onOpenFirstTrace={onOpenFirstTrace}
        onRunDone={() => {}}
      />,
    );
    expect(screen.getByTestId("run-status")).toBeInTheDocument();

    fireEvent.click(screen.getByText("Cancel"));
    fireEvent.click(screen.getByText("Open run trace"));
    expect(onCancelAll).toHaveBeenCalledTimes(1);
    expect(onOpenFirstTrace).toHaveBeenCalledTimes(1);
  });
});
