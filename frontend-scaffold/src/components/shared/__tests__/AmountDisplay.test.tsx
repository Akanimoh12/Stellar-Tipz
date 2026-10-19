import React from "react";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import AmountDisplay from "../AmountDisplay";

describe("AmountDisplay", () => {
  it("converts stroops and renders a readable XLM amount", () => {
    render(<AmountDisplay amount="123456789" />);

    const amount = screen.getByText("12.3456789 XLM");
    expect(amount).toBeVisible();
    expect(amount.tagName).toBe("SPAN");
    expect(amount).not.toHaveAttribute("aria-hidden");
  });

  it("formats large values with grouping separators", () => {
    render(<AmountDisplay amount="123456789000000" />);

    expect(screen.getByText("12,345,678.9 XLM")).toBeInTheDocument();
  });

  it("preserves its numeric styling and appends custom classes", () => {
    render(<AmountDisplay amount="10000000" className="text-xl" />);

    expect(screen.getByText("1 XLM")).toHaveClass(
      "font-black",
      "tabular-nums",
      "text-xl",
    );
  });

  it("updates the accessible text when the amount changes", () => {
    const { rerender } = render(<AmountDisplay amount="10000000" />);
    expect(screen.getByText("1 XLM")).toBeInTheDocument();

    rerender(<AmountDisplay amount="25000000" />);

    expect(screen.queryByText("1 XLM")).not.toBeInTheDocument();
    expect(screen.getByText("2.5 XLM")).toBeVisible();
  });
});
