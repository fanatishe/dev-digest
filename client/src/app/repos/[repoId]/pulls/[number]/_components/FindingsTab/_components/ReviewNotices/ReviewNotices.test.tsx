import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { ReviewNotices } from "./ReviewNotices";

afterEach(cleanup);

describe("ReviewNotices", () => {
  it("shows the in-progress banner only while a review is running", () => {
    const { rerender } = render(<ReviewNotices reviewRunning={false} lethalCount={0} />);
    expect(screen.queryByText("Review in progress…")).not.toBeInTheDocument();

    rerender(<ReviewNotices reviewRunning lethalCount={0} />);
    expect(screen.getByText("Review in progress…")).toBeInTheDocument();
  });

  it("shows the Lethal Trifecta alert with a count only when findings exist", () => {
    const { rerender } = render(<ReviewNotices reviewRunning={false} lethalCount={0} />);
    expect(screen.queryByText("Lethal Trifecta detected")).not.toBeInTheDocument();

    rerender(<ReviewNotices reviewRunning={false} lethalCount={2} />);
    expect(screen.getByText("Lethal Trifecta detected")).toBeInTheDocument();
    expect(screen.getByText("2 finding(s)")).toBeInTheDocument();
  });
});
