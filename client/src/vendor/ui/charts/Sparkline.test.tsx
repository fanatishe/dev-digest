import { describe, it, expect, afterEach } from "vitest";
import { render, cleanup } from "@testing-library/react";
import { Sparkline } from "./Sparkline";

afterEach(cleanup);

describe("Sparkline", () => {
  it("renders finite cx/cy for a SINGLE data point (no NaN — repro window of 1)", () => {
    const { container } = render(<Sparkline data={[0.8]} />);
    const dot = container.querySelector("circle")!;
    const cx = Number(dot.getAttribute("cx"));
    const cy = Number(dot.getAttribute("cy"));
    expect(Number.isNaN(cx)).toBe(false);
    expect(Number.isNaN(cy)).toBe(false);
    // The path must not carry a NaN either.
    expect(container.querySelector("path")!.getAttribute("d")).not.toMatch(/NaN/);
  });

  it("renders a multi-point trend across the width", () => {
    const { container } = render(<Sparkline data={[0.2, 0.5, 0.9]} w={80} />);
    const d = container.querySelector("path")!.getAttribute("d")!;
    expect(d).not.toMatch(/NaN/);
    expect(d.startsWith("M")).toBe(true);
  });

  it("returns null for empty data", () => {
    const { container } = render(<Sparkline data={[]} />);
    expect(container.querySelector("svg")).toBeNull();
  });
});
