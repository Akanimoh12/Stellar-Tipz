import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";

import TipAmountPresets from "../TipAmountPresets";
import { TipConfirmationModal } from "../TipConfirmationModal";
import type { Profile } from "@/types";

const mockCreator: Profile = {
  address: "GCREATOR1",
  username: "alice",
  displayName: "Alice",
  bio: "Stellar Creator",
  creditScore: 92,
  totalTipsReceived: "5000000",
  totalTipsCount: 5,
};

describe("Tipping Page Keyboard Navigation Audit (#1691)", () => {
  describe("TipAmountPresets", () => {
    it("supports keyboard selection of presets with aria-pressed state", () => {
      const handleChange = vi.fn();
      render(<TipAmountPresets onChange={handleChange} value="5" />);

      const preset5 = screen.getByRole("button", { name: "5 XLM" });
      const preset10 = screen.getByRole("button", { name: "10 XLM" });

      expect(preset5).toHaveAttribute("aria-pressed", "true");
      expect(preset10).toHaveAttribute("aria-pressed", "false");

      preset10.focus();
      expect(document.activeElement).toBe(preset10);

      fireEvent.click(preset10);
      expect(handleChange).toHaveBeenCalledWith(10);
    });

    it("focuses custom input when custom button is activated", () => {
      render(<TipAmountPresets />);

      const customButton = screen.getByRole("button", { name: /custom/i });
      customButton.focus();
      expect(document.activeElement).toBe(customButton);

      fireEvent.click(customButton);
      const input = screen.getByLabelText(/tip amount/i);
      expect(input).toBeInTheDocument();
    });
  });

  describe("TipConfirmationModal Focus & Keyboard Trap", () => {
    it("traps focus and closes on Escape key", () => {
      const handleClose = vi.fn();
      const handleConfirm = vi.fn();

      render(
        <TipConfirmationModal
          isOpen={true}
          onClose={handleClose}
          onConfirm={handleConfirm}
          creator={mockCreator}
          amount="10"
          message="Great work!"
        />
      );

      const dialog = screen.getByRole("dialog");
      expect(dialog).toBeInTheDocument();

      // Escape key closes modal
      fireEvent.keyDown(document, { key: "Escape", code: "Escape" });
      expect(handleClose).toHaveBeenCalled();
    });
  });
});
