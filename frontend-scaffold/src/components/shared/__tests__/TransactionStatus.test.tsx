import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import TransactionStatus from "../TransactionStatus";
import { useWallet } from "../../../hooks/useWallet";
import { useLiveRegion } from "../../../lib/liveRegion";

vi.mock("../../../hooks/useWallet", () => ({
  useWallet: vi.fn(),
}));

vi.mock("../../../lib/liveRegion", () => ({
  useLiveRegion: vi.fn(),
}));

describe("TransactionStatus", () => {
  const mockAnnounce = vi.fn();
  const mockUseWallet = vi.mocked(useWallet);
  const mockUseLiveRegion = vi.mocked(useLiveRegion);

  beforeEach(() => {
    vi.clearAllMocks();
    mockUseWallet.mockReturnValue({
      network: "TESTNET",
    } as ReturnType<typeof useWallet>);
    mockUseLiveRegion.mockReturnValue({
      announce: mockAnnounce,
      elementRef: { current: null },
    } as unknown as ReturnType<typeof useLiveRegion>);
  });

  describe("Rendering", () => {
    it("renders nothing when status is idle", () => {
      const { container } = render(<TransactionStatus status="idle" />);
      expect(container).toBeEmptyDOMElement();
    });

    it("renders signing state loader message", () => {
      render(<TransactionStatus status="signing" />);
      expect(
        screen.getByText("Waiting for wallet signature..."),
      ).toBeInTheDocument();
    });

    it("renders submitting state loader message", () => {
      render(<TransactionStatus status="submitting" />);
      expect(screen.getByText("Submitting transaction...")).toBeInTheDocument();
    });

    it("renders confirming state loader message", () => {
      render(<TransactionStatus status="confirming" />);
      expect(screen.getByText("Confirming on network...")).toBeInTheDocument();
    });

    it("renders success state with message, explorer link, and copy button", () => {
      render(
        <TransactionStatus
          status="success"
          txHash="1234567890abcdef1234567890abcdef"
        />,
      );

      expect(screen.getByText("Transaction confirmed!")).toBeInTheDocument();

      const explorerLink = screen.getByRole("link", {
        name: /view on stellar expert/i,
      });
      expect(explorerLink).toBeInTheDocument();
      expect(explorerLink).toHaveAttribute(
        "href",
        "https://stellar.expert/explorer/testnet/tx/1234567890abcdef1234567890abcdef",
      );
      expect(explorerLink).toHaveAttribute("target", "_blank");
      expect(explorerLink).toHaveAttribute("rel", "noopener noreferrer");

      expect(screen.getByRole("button", { name: /copy/i })).toBeInTheDocument();
    });

    it("uses public network explorer URL when network is PUBLIC", () => {
      mockUseWallet.mockReturnValue({
        network: "PUBLIC",
      } as ReturnType<typeof useWallet>);

      render(
        <TransactionStatus
          status="success"
          txHash="999abcdef"
        />,
      );

      const explorerLink = screen.getByRole("link", {
        name: /view on stellar expert/i,
      });
      expect(explorerLink).toHaveAttribute(
        "href",
        "https://stellar.expert/explorer/public/tx/999abcdef",
      );
    });

    it("renders error state with fallback error message", () => {
      render(<TransactionStatus status="error" />);
      expect(screen.getByText("Transaction failed")).toBeInTheDocument();
    });

    it("renders custom error message when provided", () => {
      render(
        <TransactionStatus
          status="error"
          errorMessage="Insufficient balance for transaction"
        />,
      );
      expect(
        screen.getByText("Insufficient balance for transaction"),
      ).toBeInTheDocument();
    });
  });

  describe("Key interactions", () => {
    it("calls onRetry when Try Again button is clicked in error state", () => {
      const onRetry = vi.fn();
      render(
        <TransactionStatus
          status="error"
          errorMessage="Network timeout"
          onRetry={onRetry}
        />,
      );

      const retryButton = screen.getByRole("button", { name: /try again/i });
      expect(retryButton).toBeInTheDocument();

      fireEvent.click(retryButton);
      expect(onRetry).toHaveBeenCalledTimes(1);
    });

    it("does not render Try Again button if onRetry is not provided", () => {
      render(
        <TransactionStatus
          status="error"
          errorMessage="Network timeout"
        />,
      );

      expect(
        screen.queryByRole("button", { name: /try again/i }),
      ).not.toBeInTheDocument();
    });
  });

  describe("Accessibility attributes and screen reader announcements", () => {
    it("has role status, aria-live polite, and aria-busy true during loading states", () => {
      render(<TransactionStatus status="signing" />);

      const statusRegion = screen.getByRole("status");
      expect(statusRegion).toHaveAttribute("aria-live", "polite");
      expect(statusRegion).toHaveAttribute("aria-busy", "true");
      expect(statusRegion).toHaveAttribute("aria-atomic", "true");
    });

    it("has role alert, aria-live assertive, and aria-busy false on error", () => {
      render(
        <TransactionStatus
          status="error"
          errorMessage="Signature rejected"
        />,
      );

      const alertRegion = screen.getByRole("alert");
      expect(alertRegion).toHaveAttribute("aria-live", "assertive");
      expect(alertRegion).toHaveAttribute("aria-busy", "false");
      expect(alertRegion).toHaveAttribute("aria-atomic", "true");
    });

    it("announces live region updates for signing, submitting, and confirming", () => {
      const { rerender } = render(<TransactionStatus status="signing" />);
      expect(mockAnnounce).toHaveBeenCalledWith("Starting transaction signing");

      rerender(<TransactionStatus status="submitting" />);
      expect(mockAnnounce).toHaveBeenCalledWith("Submitting transaction to network");

      rerender(<TransactionStatus status="confirming" />);
      expect(mockAnnounce).toHaveBeenCalledWith("Waiting for network confirmation");
    });

    it("announces assertive live region update on success and error", () => {
      const { rerender } = render(<TransactionStatus status="success" />);
      expect(mockAnnounce).toHaveBeenCalledWith(
        "Transaction confirmed. View on Stellar Expert",
        "assertive",
      );

      rerender(
        <TransactionStatus
          status="error"
          errorMessage="Insufficient funds"
        />,
      );
      expect(mockAnnounce).toHaveBeenCalledWith(
        "Transaction failed: Insufficient funds",
        "assertive",
      );
    });
  });
});
