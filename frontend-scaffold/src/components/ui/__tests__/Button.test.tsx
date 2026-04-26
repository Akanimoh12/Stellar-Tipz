import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import Button from "../Button";

describe("Button", () => {
  it("renders children", () => {
    render(<Button>Send tip</Button>);
    expect(screen.getByRole("button", { name: /send tip/i })).toBeInTheDocument();
  });

  it("renders the primary variant by default", () => {
    render(<Button>Tip</Button>);
    const btn = screen.getByRole("button");
    expect(btn.className).toMatch(/bg-black/);
    expect(btn.className).toMatch(/text-white/);
  });

  it("renders the outline variant", () => {
    render(<Button variant="outline">Tip</Button>);
    const btn = screen.getByRole("button");
    expect(btn.className).toMatch(/bg-white/);
    expect(btn.className).toMatch(/text-black/);
  });

  it("renders the ghost variant without a shadow", () => {
    render(<Button variant="ghost">Tip</Button>);
    const btn = screen.getByRole("button");
    expect(btn.className).toMatch(/bg-transparent/);
    expect(btn.style.boxShadow).toBe("none");
  });

  it("applies the requested size", () => {
    render(<Button size="lg">Big</Button>);
    const btn = screen.getByRole("button");
    expect(btn.className).toMatch(/text-lg/);
  });

  it("calls onClick when clicked", async () => {
    const onClick = vi.fn();
    render(<Button onClick={onClick}>Click me</Button>);
    await userEvent.click(screen.getByRole("button"));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("does not fire onClick when disabled", async () => {
    const onClick = vi.fn();
    render(
      <Button disabled onClick={onClick}>
        Off
      </Button>,
    );
    await userEvent.click(screen.getByRole("button"));
    expect(onClick).not.toHaveBeenCalled();
    expect(screen.getByRole("button")).toBeDisabled();
  });

  it("disables itself and shows the loader spinner when loading", () => {
    render(<Button loading>Submitting</Button>);
    const btn = screen.getByRole("button");
    expect(btn).toBeDisabled();
    // The loader is the spinning div inside the button.
    expect(btn.querySelector(".animate-spin")).not.toBeNull();
  });

  it("renders the leading icon when not loading", () => {
    render(
      <Button icon={<span data-testid="lead-icon">★</span>}>With icon</Button>,
    );
    expect(screen.getByTestId("lead-icon")).toBeInTheDocument();
  });

  it("hides the trailing icon while loading", () => {
    render(
      <Button loading iconRight={<span data-testid="trail-icon">→</span>}>
        Wait
      </Button>,
    );
    expect(screen.queryByTestId("trail-icon")).toBeNull();
  });

  it("forwards arbitrary HTML attributes (type, aria-label)", () => {
    render(
      <Button type="submit" aria-label="submit-tip">
        Go
      </Button>,
    );
    const btn = screen.getByRole("button", { name: "submit-tip" });
    expect(btn).toHaveAttribute("type", "submit");
  });

  it("merges a custom className with the built-in classes", () => {
    render(<Button className="my-extra-class">x</Button>);
    expect(screen.getByRole("button").className).toMatch(/my-extra-class/);
  });
});
