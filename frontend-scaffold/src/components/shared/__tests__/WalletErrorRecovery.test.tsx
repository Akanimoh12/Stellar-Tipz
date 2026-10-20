import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useWalletStore } from "../../../store/walletStore";
import WalletErrorRecovery from "../WalletErrorRecovery";
import type { WalletErrorType } from "../../../helpers/error";

describe("WalletErrorRecovery", () => {
  const onRetry = vi.fn();
  const onClose = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    useWalletStore.setState({ walletError: null });
  });

  it("renders null when there is no wallet error", () => {
    const { container } = render(
      <WalletErrorRecovery onRetry={onRetry} onClose={onClose} />,
    );
    expect(container.firstChild).toBeNull();
  });

  it("applies custom className to the root container", () => {
    useWalletStore.setState({
      walletError: {
        type: "unknown",
        message: "An unexpected error occurred",
      },
    });

    const { container } = render(
      <WalletErrorRecovery
        onRetry={onRetry}
        onClose={onClose}
        className="custom-recovery-class"
      />,
    );

    expect(container.firstChild).toHaveClass("custom-recovery-class");
  });

  it("renders Toast with error message", () => {
    useWalletStore.setState({
      walletError: {
        type: "timeout",
        message: "Freighter request timed out",
      },
    });

    render(<WalletErrorRecovery onRetry={onRetry} onClose={onClose} />);
    expect(screen.getByText("Freighter request timed out")).toBeInTheDocument();
  });

  describe("error configurations", () => {
    const errorTypes: {
      type: WalletErrorType;
      expectedTitle: string;
      expectedGuidance: string;
      showsInstallLink: boolean;
    }[] = [
      {
        type: "not-installed",
        expectedTitle: "Install Freighter",
        expectedGuidance:
          "Freighter is a browser extension wallet for Stellar. Install it to connect and start tipping.",
        showsInstallLink: true,
      },
      {
        type: "locked",
        expectedTitle: "Unlock Your Wallet",
        expectedGuidance:
          "Your Freighter wallet is locked. Please open Freighter and unlock it, then try again.",
        showsInstallLink: false,
      },
      {
        type: "rejected",
        expectedTitle: "Connection Rejected",
        expectedGuidance:
          "You closed or rejected the connection request. Please try again and approve the connection in your wallet.",
        showsInstallLink: false,
      },
      {
        type: "network-mismatch",
        expectedTitle: "Network Mismatch",
        expectedGuidance:
          "Your wallet is set to a different network than this app. Switch your wallet network and try again.",
        showsInstallLink: false,
      },
      {
        type: "timeout",
        expectedTitle: "Connection Timed Out",
        expectedGuidance:
          "The connection request timed out. Please try again and approve the connection in your wallet promptly.",
        showsInstallLink: false,
      },
      {
        type: "unknown",
        expectedTitle: "Wallet Error",
        expectedGuidance:
          "An unexpected wallet error occurred. Please check your wallet and try again.",
        showsInstallLink: false,
      },
    ];

    errorTypes.forEach(
      ({ type, expectedTitle, expectedGuidance, showsInstallLink }) => {
        it(`renders correct guidance and buttons for "${type}" error`, () => {
          useWalletStore.setState({
            walletError: {
              type,
              message: `Error message for ${type}`,
            },
          });

          render(<WalletErrorRecovery onRetry={onRetry} onClose={onClose} />);

          expect(
            screen.getByRole("heading", { name: expectedTitle, level: 4 }),
          ).toBeInTheDocument();
          expect(screen.getByText(expectedGuidance)).toBeInTheDocument();
          expect(screen.getByRole("button", { name: /retry/i })).toBeInTheDocument();

          const installLink = screen.queryByRole("link", {
            name: /install freighter/i,
          });
          if (showsInstallLink) {
            expect(installLink).toBeInTheDocument();
            expect(installLink).toHaveAttribute("href", "https://freighter.app");
            expect(installLink).toHaveAttribute("target", "_blank");
            expect(installLink).toHaveAttribute("rel", "noopener noreferrer");
          } else {
            expect(installLink).not.toBeInTheDocument();
          }
        });
      },
    );

    it("falls back to unknown error configuration when error type is unrecognized", () => {
      useWalletStore.setState({
        walletError: {
          type: "custom-unsupported-type" as unknown as WalletErrorType,
          message: "Strange error",
        },
      });

      render(<WalletErrorRecovery onRetry={onRetry} onClose={onClose} />);

      expect(
        screen.getByRole("heading", { name: "Wallet Error", level: 4 }),
      ).toBeInTheDocument();
      expect(
        screen.getByText(
          "An unexpected wallet error occurred. Please check your wallet and try again.",
        ),
      ).toBeInTheDocument();
    });
  });

  describe("interactions and accessibility", () => {
    beforeEach(() => {
      useWalletStore.setState({
        walletError: {
          type: "locked",
          message: "Please unlock your wallet",
        },
      });
    });

    it("has role='alert' on the recovery guidance container", () => {
      render(<WalletErrorRecovery onRetry={onRetry} onClose={onClose} />);
      expect(screen.getByRole("alert")).toBeInTheDocument();
    });

    it("calls onRetry when the Retry button is clicked", async () => {
      render(<WalletErrorRecovery onRetry={onRetry} onClose={onClose} />);
      const retryBtn = screen.getByRole("button", { name: /retry/i });

      await userEvent.click(retryBtn);
      expect(onRetry).toHaveBeenCalledTimes(1);
    });

    it("calls onClose when the Toast close button is clicked", async () => {
      render(<WalletErrorRecovery onRetry={onRetry} onClose={onClose} />);
      const closeBtn = screen.getByRole("button", { name: /close notification/i });

      await userEvent.click(closeBtn);
      expect(onClose).toHaveBeenCalledTimes(1);
    });

    it("handles missing onClose prop gracefully without throwing", async () => {
      render(<WalletErrorRecovery onRetry={onRetry} />);
      const closeBtn = screen.getByRole("button", { name: /close notification/i });

      await expect(userEvent.click(closeBtn)).resolves.not.toThrow();
    });
  });
});
