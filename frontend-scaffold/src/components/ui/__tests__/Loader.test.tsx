import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import Loader from "../Loader";

describe("Loader", () => {
  it("renders the spinner element", () => {
    const { container } = render(<Loader />);
    const spinner = container.querySelector(".animate-spin");
    expect(spinner).not.toBeNull();
  });

  it("uses medium size by default", () => {
    const { container } = render(<Loader />);
    expect(container.querySelector(".w-8.h-8")).not.toBeNull();
  });

  it("applies the requested size classes", () => {
    const { container, rerender } = render(<Loader size="sm" />);
    expect(container.querySelector(".w-4.h-4")).not.toBeNull();
    rerender(<Loader size="lg" />);
    expect(container.querySelector(".w-12.h-12")).not.toBeNull();
  });

  it("renders the supporting text when provided", () => {
    render(<Loader text="Loading profile" />);
    expect(screen.getByText("Loading profile")).toBeInTheDocument();
  });

  it("omits the text node when text is not provided", () => {
    const { container } = render(<Loader />);
    expect(container.querySelector("p")).toBeNull();
  });
});
