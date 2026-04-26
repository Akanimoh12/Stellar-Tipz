import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import Card from "../Card";

describe("Card", () => {
  it("renders children", () => {
    render(
      <Card>
        <span data-testid="content">Hello</span>
      </Card>,
    );
    expect(screen.getByTestId("content")).toHaveTextContent("Hello");
  });

  it("uses medium padding by default", () => {
    const { container } = render(<Card>x</Card>);
    expect(container.firstChild).toHaveClass("p-6");
  });

  it("applies the requested padding", () => {
    const { container } = render(<Card padding="lg">x</Card>);
    expect(container.firstChild).toHaveClass("p-8");
  });

  it("does not include the hover transform classes by default", () => {
    const { container } = render(<Card>x</Card>);
    expect(container.firstChild).not.toHaveClass("hover:-translate-x-1");
  });

  it("opts in to the hover transform when hover=true", () => {
    const { container } = render(<Card hover>x</Card>);
    expect(container.firstChild).toHaveClass("hover:-translate-x-1");
  });

  it("merges a custom className", () => {
    const { container } = render(<Card className="border-purple-500">x</Card>);
    expect(container.firstChild).toHaveClass("border-purple-500");
  });

  it("applies the brutalist box-shadow inline style", () => {
    const { container } = render(<Card>x</Card>);
    const el = container.firstChild as HTMLElement;
    expect(el.style.boxShadow).toBe("4px 4px 0px 0px rgba(0,0,0,1)");
  });
});
