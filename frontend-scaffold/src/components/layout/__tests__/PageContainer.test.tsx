import React from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { axe, toHaveNoViolations } from "jest-axe";
import { describe, expect, it, vi } from "vitest";

import PageContainer from "../PageContainer";

expect.extend(toHaveNoViolations);

const wcag21AaConfig = {
  runOnly: {
    type: "tag" as const,
    values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"],
  },
};

describe("PageContainer", () => {
  describe("rendering", () => {
    it("renders its children inside a main landmark", () => {
      render(
        <PageContainer>
          <h1>Page title</h1>
        </PageContainer>,
      );

      const main = screen.getByRole("main");
      expect(main).toContainElement(
        screen.getByRole("heading", { name: "Page title" }),
      );
    });

    it("defaults to the lg max width", () => {
      render(<PageContainer>Content</PageContainer>);

      expect(screen.getByRole("main")).toHaveClass("max-w-6xl");
    });

    it.each([
      ["sm", "max-w-2xl"],
      ["md", "max-w-4xl"],
      ["lg", "max-w-6xl"],
      ["xl", "max-w-7xl"],
    ] as const)("applies %s max width as %s", (maxWidth, expected) => {
      render(<PageContainer maxWidth={maxWidth}>Content</PageContainer>);

      expect(screen.getByRole("main")).toHaveClass(expected);
    });

    it("keeps the base layout classes alongside a custom className", () => {
      render(
        <PageContainer className="space-y-8 bg-gray-50">Content</PageContainer>,
      );

      expect(screen.getByRole("main")).toHaveClass(
        "mx-auto",
        "px-4",
        "py-8",
        "focus:outline-none",
        "space-y-8",
        "bg-gray-50",
      );
    });

    it("forwards extra HTML attributes to the main element", () => {
      render(
        <PageContainer data-testid="page" title="Dashboard page">
          Content
        </PageContainer>,
      );

      expect(screen.getByTestId("page")).toHaveAttribute(
        "title",
        "Dashboard page",
      );
    });
  });

  describe("interactions", () => {
    it("can receive focus programmatically for skip links", () => {
      render(<PageContainer>Content</PageContainer>);
      const main = screen.getByRole("main");

      main.focus();

      expect(main).toHaveFocus();
    });

    it("stays out of the sequential tab order", async () => {
      const user = userEvent.setup();
      render(
        <PageContainer>
          <button type="button">First action</button>
        </PageContainer>,
      );

      await user.tab();

      expect(
        screen.getByRole("button", { name: "First action" }),
      ).toHaveFocus();
    });

    it("is the target of a skip-to-content link", () => {
      render(
        <>
          <a href="#main-content">Skip to main content</a>
          <PageContainer>Content</PageContainer>
        </>,
      );

      const skipLink = screen.getByRole("link", {
        name: "Skip to main content",
      });
      const target = document.getElementById(
        skipLink.getAttribute("href")!.slice(1),
      );

      expect(target).toBe(screen.getByRole("main"));
    });

    it("forwards event handlers to the main element", async () => {
      const user = userEvent.setup();
      const onClick = vi.fn();
      render(<PageContainer onClick={onClick}>Content</PageContainer>);

      await user.click(screen.getByRole("main"));

      expect(onClick).toHaveBeenCalledTimes(1);
    });
  });

  describe("accessibility", () => {
    it("exposes the skip-link target id and tabindex", () => {
      render(<PageContainer>Content</PageContainer>);
      const main = screen.getByRole("main");

      expect(main).toHaveAttribute("id", "main-content");
      expect(main).toHaveAttribute("tabindex", "-1");
    });

    it("names the landmark from the ariaLabel prop", () => {
      render(
        <PageContainer ariaLabel="Admin dashboard content">
          Content
        </PageContainer>,
      );

      expect(
        screen.getByRole("main", { name: "Admin dashboard content" }),
      ).toBeInTheDocument();
      expect(screen.getByRole("main")).not.toHaveAttribute("arialabel");
    });

    it("accepts a native aria-label attribute", () => {
      render(
        <PageContainer aria-label="Profile content">Content</PageContainer>,
      );

      expect(
        screen.getByRole("main", { name: "Profile content" }),
      ).toBeInTheDocument();
    });

    it("has no accessible name when no label is given", () => {
      render(<PageContainer>Content</PageContainer>);

      expect(screen.getByRole("main")).not.toHaveAttribute("aria-label");
    });

    it("has no WCAG 2.1 AA axe violations", async () => {
      const { container } = render(
        <PageContainer ariaLabel="Page content">
          <h1>Page title</h1>
          <p>Body copy</p>
        </PageContainer>,
      );

      expect(await axe(container, wcag21AaConfig)).toHaveNoViolations();
    });
  });
});
