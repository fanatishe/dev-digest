import React from "react";
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { CodeEditor } from "./CodeEditor";

afterEach(cleanup);

describe("CodeEditor", () => {
  it("renders a line-number gutter with one number per line", () => {
    render(<CodeEditor value={"# Title\n\n- item"} ariaLabel="Body" />);
    // 3 lines → gutter shows 1, 2, 3
    expect(screen.getByText("1")).toBeInTheDocument();
    expect(screen.getByText("2")).toBeInTheDocument();
    expect(screen.getByText("3")).toBeInTheDocument();
  });

  it("shows at least line 1 for empty content", () => {
    render(<CodeEditor value="" ariaLabel="Body" />);
    expect(screen.getByText("1")).toBeInTheDocument();
  });

  it("forwards edits through onChange", () => {
    const onChange = vi.fn();
    render(<CodeEditor value="a" onChange={onChange} ariaLabel="Body" />);
    fireEvent.change(screen.getByLabelText("Body"), { target: { value: "ab" } });
    expect(onChange).toHaveBeenCalledWith("ab");
  });

  it("keeps the highlight layer in sync on scroll without throwing", () => {
    render(<CodeEditor value={"x\n".repeat(50)} ariaLabel="Body" />);
    const ta = screen.getByLabelText("Body");
    expect(() => fireEvent.scroll(ta, { target: { scrollTop: 40 } })).not.toThrow();
  });
});
