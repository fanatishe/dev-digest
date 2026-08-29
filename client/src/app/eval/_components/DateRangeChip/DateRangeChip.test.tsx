import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { DateRangeChip } from "./DateRangeChip";

afterEach(cleanup);

describe("DateRangeChip (AC-29 UI)", () => {
  it("defaults to the 30-day window and emits an ISO {from,to} range on select", () => {
    const onChange = vi.fn();
    render(<DateRangeChip onChange={onChange} />);

    // With no `?from`, the 30-day preset is the active default.
    expect(screen.getByRole("button", { name: /last 30 days/i })).toHaveAttribute(
      "aria-pressed",
      "true",
    );

    // Selecting a preset emits a single ISO range spanning that many days.
    fireEvent.click(screen.getByRole("button", { name: /last 7 days/i }));
    expect(onChange).toHaveBeenCalledTimes(1);
    const range = onChange.mock.calls[0]![0] as { from: string; to: string };
    const spanDays = (Date.parse(range.to) - Date.parse(range.from)) / 86_400_000;
    expect(Math.round(spanDays)).toBe(7);
    // Both keys are ISO instants (drives `?from&to`).
    expect(Number.isNaN(Date.parse(range.from))).toBe(false);
    expect(Number.isNaN(Date.parse(range.to))).toBe(false);
  });

  it("reflects the active preset from the current `from` value", () => {
    const from = new Date(Date.now() - 90 * 86_400_000).toISOString();
    render(<DateRangeChip from={from} onChange={vi.fn()} />);
    expect(screen.getByRole("button", { name: /last 90 days/i })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });
});
