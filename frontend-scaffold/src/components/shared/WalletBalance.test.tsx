import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, act } from "@testing-library/react";
import React from "react";

import WalletBalance from "./WalletBalance";

vi.mock("@/hooks/useWallet", () => ({
  useWallet: vi.fn(),
}));

vi.mock("@/hooks/useBalance", () => ({
  useBalance: vi.fn(),
}));

vi.mock("@/hooks/useXlmPrice", () => ({
  useXlmPrice: vi.fn(),
}));

import { useWallet } from "@/hooks/useWallet";
import { useBalance } from "@/hooks/useBalance";
import { useXlmPrice } from "@/hooks/useXlmPrice";

const mockUseWallet = useWallet as ReturnType<typeof vi.fn>;
const mockUseBalance = useBalance as ReturnType<typeof vi.fn>;
const mockUseXlmPrice = useXlmPrice as ReturnType<typeof vi.fn>;

describe("WalletBalance", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseXlmPrice.mockReturnValue({ price: null, loading: false, refetch: vi.fn() });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("renders nothing when not connected", () => {
    mockUseWallet.mockReturnValue({ connected: false, publicKey: null });
    mockUseBalance.mockReturnValue({ balance: null, loading: false, error: null, refetch: vi.fn() });

    const { container } = render(<WalletBalance />);
    expect(container.innerHTML).toBe("");
  });

  it("displays balance after connecting", async () => {
    mockUseWallet.mockReturnValue({
      connected: true,
      publicKey: "GABCDEFGHIJKLMNOPQRSTUVWXYZ1234567890ABCD",
    });
    mockUseBalance.mockReturnValue({
      balance: "100.5000000",
      loading: false,
      error: null,
      refetch: vi.fn(),
    });

    render(<WalletBalance />);
    expect(screen.getByText("100.50 XLM")).toBeInTheDocument();
  });

  it("shows low balance warning when below 5 XLM", () => {
    mockUseWallet.mockReturnValue({
      connected: true,
      publicKey: "GABCDEFGHIJKLMNOPQRSTUVWXYZ1234567890ABCD",
    });
    mockUseBalance.mockReturnValue({
      balance: "2.0000000",
      loading: false,
      error: null,
      refetch: vi.fn(),
    });

    render(<WalletBalance />);
    expect(screen.getByText("2.00 XLM")).toBeInTheDocument();
    expect(screen.getByLabelText("Low balance warning")).toBeInTheDocument();
  });

  it("auto-refreshes every 30 seconds", () => {
    vi.useFakeTimers();

    const refetch = vi.fn();
    mockUseWallet.mockReturnValue({
      connected: true,
      publicKey: "GABCDEFGHIJKLMNOPQRSTUVWXYZ1234567890ABCD",
    });
    mockUseBalance.mockReturnValue({
      balance: "50.0000000",
      loading: false,
      error: null,
      refetch,
    });

    render(<WalletBalance />);
    expect(refetch).toHaveBeenCalledTimes(0);

    act(() => {
      vi.advanceTimersByTime(30_000);
    });
    expect(refetch).toHaveBeenCalledTimes(1);

    act(() => {
      vi.advanceTimersByTime(30_000);
    });
    expect(refetch).toHaveBeenCalledTimes(2);
  });

  it("shows loading state during fetch", () => {
    mockUseWallet.mockReturnValue({
      connected: true,
      publicKey: "GABCDEFGHIJKLMNOPQRSTUVWXYZ1234567890ABCD",
    });
    mockUseBalance.mockReturnValue({
      balance: null,
      loading: true,
      error: null,
      refetch: vi.fn(),
    });

    render(<WalletBalance />);
    expect(screen.getByText(/···/)).toBeInTheDocument();
  });

  it("shows manual refresh button that triggers refetch", () => {
    const refetch = vi.fn();
    mockUseWallet.mockReturnValue({
      connected: true,
      publicKey: "GABCDEFGHIJKLMNOPQRSTUVWXYZ1234567890ABCD",
    });
    mockUseBalance.mockReturnValue({
      balance: "50.0000000",
      loading: false,
      error: null,
      refetch,
    });

    render(<WalletBalance />);
    const refreshButton = screen.getByLabelText("Refresh balance");
    refreshButton.click();
    expect(refetch).toHaveBeenCalledTimes(1);
  });

  it("displays USD estimate when price is available", () => {
    mockUseWallet.mockReturnValue({
      connected: true,
      publicKey: "GABCDEFGHIJKLMNOPQRSTUVWXYZ1234567890ABCD",
    });
    mockUseBalance.mockReturnValue({
      balance: "100.0000000",
      loading: false,
      error: null,
      refetch: vi.fn(),
    });
    mockUseXlmPrice.mockReturnValue({
      price: 0.15,
      loading: false,
      refetch: vi.fn(),
    });

    render(<WalletBalance />);
    expect(screen.getByText("100.00 XLM")).toBeInTheDocument();
    expect(screen.getByText(/≈ \$15\.00/)).toBeInTheDocument();
  });

  it("handles zero balance without low balance warning", () => {
    mockUseWallet.mockReturnValue({
      connected: true,
      publicKey: "GABCDEFGHIJKLMNOPQRSTUVWXYZ1234567890ABCD",
    });
    mockUseBalance.mockReturnValue({
      balance: "5.0000000",
      loading: false,
      error: null,
      refetch: vi.fn(),
    });

    render(<WalletBalance />);
    expect(screen.getByText("5.00 XLM")).toBeInTheDocument();
    expect(screen.queryByLabelText("Low balance warning")).not.toBeInTheDocument();
  });

  it("handles error state gracefully", () => {
    mockUseWallet.mockReturnValue({
      connected: true,
      publicKey: "GABCDEFGHIJKLMNOPQRSTUVWXYZ1234567890ABCD",
    });
    mockUseBalance.mockReturnValue({
      balance: null,
      loading: false,
      error: "Network error",
      refetch: vi.fn(),
    });

    render(<WalletBalance />);
    expect(screen.getByText("Balance unavailable")).toBeInTheDocument();
  });

  it("stops auto-refresh after unmount", () => {
    vi.useFakeTimers();

    const refetch = vi.fn();
    mockUseWallet.mockReturnValue({
      connected: true,
      publicKey: "GABCDEFGHIJKLMNOPQRSTUVWXYZ1234567890ABCD",
    });
    mockUseBalance.mockReturnValue({
      balance: "50.0000000",
      loading: false,
      error: null,
      refetch,
    });

    const { unmount } = render(<WalletBalance />);
    unmount();

    act(() => {
      vi.advanceTimersByTime(30_000);
    });
    expect(refetch).not.toHaveBeenCalled();
  });
});
