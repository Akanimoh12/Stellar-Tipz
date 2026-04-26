import { renderHook, act, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { useWallet } from "../useWallet";
import { useWalletStore } from "../../store/walletStore";
import * as walletKitModule from "@creit.tech/stellar-wallets-kit";

interface WalletSelectionHandler {
  onWalletSelected: (option: { id: string }) => Promise<void>;
}

const mockWalletKit = (walletKitModule as unknown as { __mockWalletKit: Record<string, import("vitest").Mock> }).__mockWalletKit;

// Mock window.freighter
Object.defineProperty(window, "freighter", {
  value: {
    getNetwork: vi.fn(),
    getAddress: vi.fn(),
  },
  writable: true,
});

describe("useWallet", () => {
  beforeEach(() => {
    // Reset the store before each test
    useWalletStore.setState({
      publicKey: null,
      connected: false,
      connecting: false,
      error: null,
      network: "TESTNET",
    });
    vi.clearAllMocks();
    Object.values(mockWalletKit).forEach((mockFn) => {
      if (typeof mockFn === "function" && "mockReset" in mockFn) {
        (mockFn as ReturnType<typeof vi.fn>).mockReset();
      }
    });
  });

  it("should return initial wallet state", () => {
    const { result } = renderHook(() => useWallet());

    expect(result.current.publicKey).toBeNull();
    expect(result.current.connected).toBe(false);
    expect(result.current.connecting).toBe(false);
    expect(result.current.error).toBeNull();
    expect(result.current.network).toBe("TESTNET");
  });

  it("should connect wallet and set publicKey", async () => {
    const { result } = renderHook(() => useWallet());

    const mockAddress = "GD1234567890ABCDEF";
    const mockOnWalletSelected = vi.fn();

    // Mock the kit.openModal to call the callback with address
    mockWalletKit.openModal.mockImplementation(
      ({ onWalletSelected }: WalletSelectionHandler) => {
        mockOnWalletSelected.mockImplementation(
          async (option: { id: string }) => {
            mockWalletKit.setWallet(option.id);
            mockWalletKit.getAddress.mockResolvedValue({
              address: mockAddress,
            });
            await onWalletSelected(option);
          },
        );
        return Promise.resolve();
      },
    );

    await act(async () => {
      result.current.connect();
    });

    // Simulate wallet selection
    await act(async () => {
      await mockOnWalletSelected({ id: "freighter" });
    });

    await waitFor(() => {
      expect(result.current.publicKey).toBe(mockAddress);
      expect(result.current.connected).toBe(true);
      expect(result.current.connecting).toBe(false);
      expect(result.current.error).toBeNull();
    });
  });

  it("should disconnect wallet and clear state", () => {
    // First set up a connected state
    useWalletStore.setState({
      publicKey: "GD1234567890ABCDEF",
      connected: true,
      connecting: false,
      error: null,
      network: "TESTNET",
    });

    const { result } = renderHook(() => useWallet());

    expect(result.current.publicKey).toBe("GD1234567890ABCDEF");
    expect(result.current.connected).toBe(true);

    act(() => {
      result.current.disconnect();
    });

    expect(result.current.publicKey).toBeNull();
    expect(result.current.connected).toBe(false);
    expect(result.current.error).toBeNull();
  });

  it("should handle connection errors", async () => {
    const { result } = renderHook(() => useWallet());

    const mockOnWalletSelected = vi.fn();

    // Mock the kit.openModal to call the callback with error
    mockWalletKit.openModal.mockImplementation(
      ({ onWalletSelected }: WalletSelectionHandler) => {
        mockOnWalletSelected.mockImplementation(
          async (option: { id: string }) => {
            mockWalletKit.setWallet(option.id);
            mockWalletKit.getAddress.mockRejectedValue(
              new Error("Connection failed"),
            );
            await onWalletSelected(option);
          },
        );
        return Promise.resolve();
      },
    );

    await act(async () => {
      result.current.connect();
    });

    // Simulate wallet selection with error
    await act(async () => {
      await mockOnWalletSelected({ id: "freighter" });
    });

    await waitFor(() => {
      expect(result.current.publicKey).toBeNull();
      expect(result.current.connected).toBe(false);
      expect(result.current.connecting).toBe(false);
      expect(result.current.error).toBe("Connection failed");
    });
  });

  it("should set network", () => {
    const { result } = renderHook(() => useWallet());

    expect(result.current.network).toBe("TESTNET");

    act(() => {
      result.current.setNetwork("PUBLIC");
    });

    expect(result.current.network).toBe("PUBLIC");
  });

  it("should sign transaction", async () => {
    vi.useFakeTimers();
    const mockXdr = "AAAAAgAAAAA=";
    const mockSignedXdr = "AAAAAwAAAAA=";

    // Set up connected state
    useWalletStore.setState({
      publicKey: "GD1234567890ABCDEF",
      connected: true,
      connecting: false,
      error: null,
      network: "TESTNET",
    });

    const { result } = renderHook(() => useWallet());

    mockWalletKit.signTransaction.mockResolvedValue({
      signedTxXdr: mockSignedXdr,
    });

    const signedTx = await result.current.signTransaction(mockXdr);

    expect(signedTx).toBe(mockSignedXdr);
    expect(mockWalletKit.signTransaction).toHaveBeenCalledWith(mockXdr, {
      address: "GD1234567890ABCDEF",
    });

    await act(async () => {
      vi.runAllTimers();
    });
    
    vi.useRealTimers();
  });
});
