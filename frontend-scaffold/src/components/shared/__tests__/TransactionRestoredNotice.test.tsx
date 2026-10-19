import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import TransactionRestoredNotice from "../TransactionRestoredNotice";

describe("TransactionRestoredNotice", () => {
  describe("Rendering", () => {
    it("renders nothing when restored is false", () => {
      const { container } = render(
        <TransactionRestoredNotice restored={false} onDismiss={vi.fn()} />,
      );
      expect(container).toBeEmptyDOMElement();
    });

    it("renders alert banner and explanatory text when restored is true", () => {
      render(
        <TransactionRestoredNotice restored={true} onDismiss={vi.fn()} />,
      );

      expect(
        screen.getByText(
          "A transaction was still in progress when you left this page. It may have been interrupted.",
        ),
      ).toBeInTheDocument();
      expect(
        screen.getByRole("button", { name: /dismiss/i }),
      ).toBeInTheDocument();
    });
  });

  describe("Key interactions", () => {
    it("calls onDismiss when clicking the Dismiss button", () => {
      const onDismiss = vi.fn();
      render(
        <TransactionRestoredNotice restored={true} onDismiss={onDismiss} />,
      );

      const dismissButton = screen.getByRole("button", { name: /dismiss/i });
      fireEvent.click(dismissButton);

      expect(onDismiss).toHaveBeenCalledTimes(1);
    });

    it("allows focusing the dismiss button via keyboard", () => {
      render(
        <TransactionRestoredNotice restored={true} onDismiss={vi.fn()} />,
      );

      const dismissButton = screen.getByRole("button", { name: /dismiss/i });
      dismissButton.focus();
      expect(dismissButton).toHaveFocus();
    });
  });

  describe("Accessibility attributes", () => {
    it("has role alert for screen readers", () => {
      render(
        <TransactionRestoredNotice restored={true} onDismiss={vi.fn()} />,
      );

      const alertBanner = screen.getByRole("alert");
      expect(alertBanner).toBeInTheDocument();
    });

    it("renders button with explicit type='button'", () => {
      render(
        <TransactionRestoredNotice restored={true} onDismiss={vi.fn()} />,
      );

      const dismissButton = screen.getByRole("button", { name: /dismiss/i });
      expect(dismissButton).toHaveAttribute("type", "button");
    });
  });
});
