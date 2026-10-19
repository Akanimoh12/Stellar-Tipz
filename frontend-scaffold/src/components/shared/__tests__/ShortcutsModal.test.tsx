import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import ShortcutsModal from "../ShortcutsModal";

describe("ShortcutsModal", () => {
  const defaultProps = {
    isOpen: true,
    onClose: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("Rendering", () => {
    it("renders nothing when isOpen is false", () => {
      const { container } = render(
        <ShortcutsModal {...defaultProps} isOpen={false} />,
      );
      expect(container).toBeEmptyDOMElement();
    });

    it("renders modal title and all shortcut sections when open", () => {
      render(<ShortcutsModal {...defaultProps} />);

      expect(
        screen.getByRole("heading", { name: "Keyboard shortcuts" }),
      ).toBeInTheDocument();

      expect(screen.getByText("Navigation")).toBeInTheDocument();
      expect(screen.getByText("Tip page")).toBeInTheDocument();
      expect(screen.getByText("General")).toBeInTheDocument();
    });

    it("renders all shortcut descriptions and keyboard keys", () => {
      render(<ShortcutsModal {...defaultProps} />);

      expect(screen.getByText("Quick search creators")).toBeInTheDocument();
      expect(screen.getByText("Go to Home")).toBeInTheDocument();
      expect(screen.getByText("Go to Leaderboard")).toBeInTheDocument();
      expect(screen.getByText("Go to Dashboard")).toBeInTheDocument();
      expect(screen.getByText("Open tip form")).toBeInTheDocument();
      expect(screen.getByText("Show this shortcuts help")).toBeInTheDocument();
      expect(screen.getByText("Close any open modal")).toBeInTheDocument();

      // Check footer info notice
      expect(
        screen.getByText(/Shortcuts are disabled while typing in input fields\./i),
      ).toBeInTheDocument();
    });

    it("renders sequential 'then' joiners for sequential shortcuts", () => {
      render(<ShortcutsModal {...defaultProps} />);

      // Sequential shortcuts (G then H, G then L, G then D)
      const thenLabels = screen.getAllByText("then");
      expect(thenLabels.length).toBeGreaterThanOrEqual(3);
    });
  });

  describe("Key interactions", () => {
    it("calls onClose when clicking the close button", () => {
      const onClose = vi.fn();
      render(<ShortcutsModal isOpen={true} onClose={onClose} />);

      const closeButton = screen.getByRole("button", { name: /close/i });
      fireEvent.click(closeButton);

      expect(onClose).toHaveBeenCalledTimes(1);
    });

    it("calls onClose when pressing Escape key", () => {
      const onClose = vi.fn();
      render(<ShortcutsModal isOpen={true} onClose={onClose} />);

      fireEvent.keyDown(document, { key: "Escape" });
      expect(onClose).toHaveBeenCalledTimes(1);
    });

    it("calls onClose when clicking the modal backdrop", () => {
      const onClose = vi.fn();
      render(<ShortcutsModal isOpen={true} onClose={onClose} />);

      const backdrop = screen.getByRole("presentation");
      fireEvent.click(backdrop);

      expect(onClose).toHaveBeenCalledTimes(1);
    });
  });

  describe("Accessibility attributes", () => {
    it("renders as a dialog with aria-modal", () => {
      render(<ShortcutsModal {...defaultProps} />);

      const dialog = screen.getByRole("dialog");
      expect(dialog).toBeInTheDocument();
      expect(dialog).toHaveAttribute("aria-modal", "true");
    });

    it("associates the dialog with the heading via aria-labelledby", () => {
      render(<ShortcutsModal {...defaultProps} />);

      const dialog = screen.getByRole("dialog");
      const heading = screen.getByRole("heading", { name: "Keyboard shortcuts" });

      expect(dialog).toHaveAttribute("aria-labelledby", heading.id);
    });
  });
});
