import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import Pagination from "../Pagination";

describe("Pagination", () => {
  it("renders null when totalPages is 0 or 1", () => {
    const { container: container0 } = render(
      <Pagination currentPage={1} totalPages={0} onPageChange={vi.fn()} />,
    );
    expect(container0.firstChild).toBeNull();

    const { container: container1 } = render(
      <Pagination currentPage={1} totalPages={1} onPageChange={vi.fn()} />,
    );
    expect(container1.firstChild).toBeNull();
  });

  it("renders navigation container with aria-label='Pagination'", () => {
    render(
      <Pagination currentPage={1} totalPages={5} onPageChange={vi.fn()} />,
    );
    expect(
      screen.getByRole("navigation", { name: "Pagination" }),
    ).toBeInTheDocument();
  });

  describe("visible page window calculation", () => {
    it("renders all pages when totalPages <= MAX_VISIBLE_PAGES (5)", () => {
      render(
        <Pagination currentPage={1} totalPages={4} onPageChange={vi.fn()} />,
      );

      expect(screen.getByRole("button", { name: /page 1/i })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /page 2/i })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /page 3/i })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /page 4/i })).toBeInTheDocument();
      expect(screen.queryByRole("button", { name: /page 5/i })).not.toBeInTheDocument();
    });

    it("renders first 5 pages when near the start of a large page list", () => {
      render(
        <Pagination currentPage={1} totalPages={10} onPageChange={vi.fn()} />,
      );

      [1, 2, 3, 4, 5].forEach((p) => {
        expect(
          screen.getByRole("button", { name: new RegExp(`page ${p}`, "i") }),
        ).toBeInTheDocument();
      });
      expect(screen.queryByRole("button", { name: /page 6/i })).not.toBeInTheDocument();
    });

    it("centers the 5-page window around the current page when in the middle", () => {
      render(
        <Pagination currentPage={5} totalPages={10} onPageChange={vi.fn()} />,
      );

      [3, 4, 5, 6, 7].forEach((p) => {
        expect(
          screen.getByRole("button", { name: new RegExp(`page ${p}`, "i") }),
        ).toBeInTheDocument();
      });
      expect(screen.queryByRole("button", { name: /page 2/i })).not.toBeInTheDocument();
      expect(screen.queryByRole("button", { name: /page 8/i })).not.toBeInTheDocument();
    });

    it("anchors the 5-page window at the end when on the last page", () => {
      render(
        <Pagination currentPage={10} totalPages={10} onPageChange={vi.fn()} />,
      );

      [6, 7, 8, 9, 10].forEach((p) => {
        expect(
          screen.getByRole("button", { name: new RegExp(`page ${p}`, "i") }),
        ).toBeInTheDocument();
      });
      expect(screen.queryByRole("button", { name: /page 5/i })).not.toBeInTheDocument();
    });
  });

  describe("disabled states for boundary pages", () => {
    it("disables First and Prev buttons when on the first page", () => {
      render(
        <Pagination currentPage={1} totalPages={5} onPageChange={vi.fn()} />,
      );

      expect(screen.getByRole("button", { name: "Go to first page" })).toBeDisabled();
      expect(screen.getByRole("button", { name: "Go to previous page" })).toBeDisabled();
      expect(screen.getByRole("button", { name: "Go to next page" })).toBeEnabled();
      expect(screen.getByRole("button", { name: "Go to last page" })).toBeEnabled();
    });

    it("disables Next and Last buttons when on the last page", () => {
      render(
        <Pagination currentPage={5} totalPages={5} onPageChange={vi.fn()} />,
      );

      expect(screen.getByRole("button", { name: "Go to first page" })).toBeEnabled();
      expect(screen.getByRole("button", { name: "Go to previous page" })).toBeEnabled();
      expect(screen.getByRole("button", { name: "Go to next page" })).toBeDisabled();
      expect(screen.getByRole("button", { name: "Go to last page" })).toBeDisabled();
    });

    it("enables all navigation buttons when on an intermediate page", () => {
      render(
        <Pagination currentPage={3} totalPages={5} onPageChange={vi.fn()} />,
      );

      expect(screen.getByRole("button", { name: "Go to first page" })).toBeEnabled();
      expect(screen.getByRole("button", { name: "Go to previous page" })).toBeEnabled();
      expect(screen.getByRole("button", { name: "Go to next page" })).toBeEnabled();
      expect(screen.getByRole("button", { name: "Go to last page" })).toBeEnabled();
    });
  });

  describe("accessibility attributes", () => {
    it("marks the current active page with aria-current='page'", () => {
      render(
        <Pagination currentPage={3} totalPages={5} onPageChange={vi.fn()} />,
      );

      const activeBtn = screen.getByRole("button", {
        name: "Current page, page 3",
      });
      expect(activeBtn).toHaveAttribute("aria-current", "page");

      const inactiveBtn = screen.getByRole("button", {
        name: "Go to page 2",
      });
      expect(inactiveBtn).not.toHaveAttribute("aria-current");
    });

    it("provides descriptive aria-labels for all navigation controls", () => {
      render(
        <Pagination currentPage={2} totalPages={5} onPageChange={vi.fn()} />,
      );

      expect(screen.getByLabelText("Go to first page")).toBeInTheDocument();
      expect(screen.getByLabelText("Go to previous page")).toBeInTheDocument();
      expect(screen.getByLabelText("Go to next page")).toBeInTheDocument();
      expect(screen.getByLabelText("Go to last page")).toBeInTheDocument();
      expect(screen.getByLabelText("Current page, page 2")).toBeInTheDocument();
      expect(screen.getByLabelText("Go to page 1")).toBeInTheDocument();
    });
  });

  describe("key interactions", () => {
    it("calls onPageChange with page number when an inactive page is clicked", async () => {
      const onPageChange = vi.fn();
      render(
        <Pagination currentPage={1} totalPages={5} onPageChange={onPageChange} />,
      );

      await userEvent.click(screen.getByRole("button", { name: "Go to page 3" }));
      expect(onPageChange).toHaveBeenCalledWith(3);
    });

    it("does not call onPageChange when the active page button is clicked", async () => {
      const onPageChange = vi.fn();
      render(
        <Pagination currentPage={2} totalPages={5} onPageChange={onPageChange} />,
      );

      await userEvent.click(
        screen.getByRole("button", { name: "Current page, page 2" }),
      );
      expect(onPageChange).not.toHaveBeenCalled();
    });

    it("calls onPageChange with next page when Next is clicked", async () => {
      const onPageChange = vi.fn();
      render(
        <Pagination currentPage={2} totalPages={5} onPageChange={onPageChange} />,
      );

      await userEvent.click(screen.getByRole("button", { name: "Go to next page" }));
      expect(onPageChange).toHaveBeenCalledWith(3);
    });

    it("calls onPageChange with previous page when Prev is clicked", async () => {
      const onPageChange = vi.fn();
      render(
        <Pagination currentPage={3} totalPages={5} onPageChange={onPageChange} />,
      );

      await userEvent.click(
        screen.getByRole("button", { name: "Go to previous page" }),
      );
      expect(onPageChange).toHaveBeenCalledWith(2);
    });

    it("calls onPageChange with 1 when First is clicked", async () => {
      const onPageChange = vi.fn();
      render(
        <Pagination currentPage={4} totalPages={5} onPageChange={onPageChange} />,
      );

      await userEvent.click(screen.getByRole("button", { name: "Go to first page" }));
      expect(onPageChange).toHaveBeenCalledWith(1);
    });

    it("calls onPageChange with totalPages when Last is clicked", async () => {
      const onPageChange = vi.fn();
      render(
        <Pagination currentPage={2} totalPages={7} onPageChange={onPageChange} />,
      );

      await userEvent.click(screen.getByRole("button", { name: "Go to last page" }));
      expect(onPageChange).toHaveBeenCalledWith(7);
    });
  });
});
