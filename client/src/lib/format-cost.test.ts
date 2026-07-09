import { describe, it, expect } from "vitest";
import { formatCost } from "./format-cost";

describe("formatCost", () => {
  it("renders an em-dash (never $0.00) when no cost was reported", () => {
    expect(formatCost(null)).toBe("—");
    expect(formatCost(undefined)).toBe("—");
  });

  it("distinguishes a genuine zero from missing data", () => {
    expect(formatCost(0)).toBe("$0.00");
  });

  it("keeps sub-cent precision but trims trailing zeros to ≥2 decimals", () => {
    expect(formatCost(0.0013)).toBe("$0.0013");
    expect(formatCost(0.014)).toBe("$0.014");
    expect(formatCost(0.06)).toBe("$0.06");
    expect(formatCost(0.2)).toBe("$0.20");
    expect(formatCost(1.5)).toBe("$1.50");
  });
});
