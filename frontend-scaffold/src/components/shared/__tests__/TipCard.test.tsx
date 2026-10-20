import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import TipCard, { TipCardSkeleton } from "../TipCard";
import type { Tip } from "../../../types";

describe("TipCard", () => {
  const baseTip: Tip = {
    id: 1,
    tipper: "GA11111111111111111111111111111111111111111111111111111111",
    creator: "GB22222222222222222222222222222222222222222222222222222222",
    amount: "50000000", // 5 XLM (7 decimals in stroops)
    message: "Keep up the awesome work!",
    timestamp: Date.now() - 5000,
  };

  describe("Rendering", () => {
    it("renders sender, receiver, message, and formatted amount", () => {
      render(<TipCard tip={baseTip} />);

      // Primary label (From) and secondary label (To)
      expect(screen.getByText("From")).toBeInTheDocument();
      expect(screen.getByText(/To:/)).toBeInTheDocument();

      // Message and amount
      expect(screen.getByText("Keep up the awesome work!")).toBeInTheDocument();
      expect(screen.getByText(/5 XLM/)).toBeInTheDocument();

      // Activity label
      expect(screen.getByText("Tip activity")).toBeInTheDocument();
    });

    it("renders fallback message when no message is attached", () => {
      const tipWithoutMessage: Tip = {
        ...baseTip,
        message: "",
      };

      render(<TipCard tip={tipWithoutMessage} />);

      expect(screen.getByText("No message attached.")).toBeInTheDocument();
    });

    it("renders relative timestamp correctly for recent and older tips", () => {
      const now = Date.now();

      // Just now (<60s)
      const { unmount } = render(
        <TipCard tip={{ ...baseTip, timestamp: now - 10_000 }} />,
      );
      expect(screen.getByText("just now")).toBeInTheDocument();
      unmount();

      // Minutes ago
      render(
        <TipCard tip={{ ...baseTip, timestamp: now - 5 * 60_000 }} />,
      );
      expect(screen.getByText("5 mins ago")).toBeInTheDocument();
    });

    it("normalizes timestamp provided in seconds", () => {
      const secondsTimestamp = Math.floor((Date.now() - 120_000) / 1000);
      render(
        <TipCard tip={{ ...baseTip, timestamp: secondsTimestamp }} />,
      );
      expect(screen.getByText("2 mins ago")).toBeInTheDocument();
    });

    it("renders creator as primary when showSender is false", () => {
      render(<TipCard tip={baseTip} showSender={false} showReceiver={true} />);

      // Primary header should be "To"
      expect(screen.getByText("To")).toBeInTheDocument();
      // Secondary header should be "From:"
      expect(screen.getByText(/From:/)).toBeInTheDocument();
    });

    it("does not render secondary address when showReceiver is false", () => {
      render(<TipCard tip={baseTip} showSender={true} showReceiver={false} />);

      expect(screen.getByText("From")).toBeInTheDocument();
      expect(screen.queryByText(/To:/)).not.toBeInTheDocument();
    });
  });

  describe("Key interactions", () => {
    it("is rendered as a clickable button element with keyboard focus support", () => {
      const handleClick = vi.fn();
      render(
        <div onClick={handleClick}>
          <TipCard tip={baseTip} />
        </div>,
      );

      const button = screen.getByRole("button");
      expect(button).toBeInTheDocument();
      expect(button).toHaveAttribute("type", "button");

      fireEvent.click(button);
      expect(handleClick).toHaveBeenCalledTimes(1);

      button.focus();
      expect(button).toHaveFocus();
    });
  });

  describe("Accessibility attributes", () => {
    it("has accessible button name with primary address label", () => {
      render(<TipCard tip={baseTip} />);

      const button = screen.getByRole("button");
      expect(button).toHaveAttribute(
        "aria-label",
        expect.stringMatching(/^Open tip card for /),
      );
    });

    it("renders avatar with descriptive alt text", () => {
      render(<TipCard tip={baseTip} />);

      const avatar = screen.getByAltText(`From ${baseTip.tipper}`);
      expect(avatar).toBeInTheDocument();
    });

    it("renders TipCardSkeleton with status role and aria-busy", () => {
      render(<TipCardSkeleton />);

      const skeleton = screen.getByRole("status");
      expect(skeleton).toBeInTheDocument();
      expect(skeleton).toHaveAttribute("aria-busy", "true");
    });
  });
});
