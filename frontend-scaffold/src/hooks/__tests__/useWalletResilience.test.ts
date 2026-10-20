/**
 * Tests for the `useWalletResilience` hook.
 *
 * The hook polls the Freighter extension every 3s while a wallet is
 * connected and disconnects with a user-facing error when the extension
 * disappears, the account is switched, or the connection keeps failing.
 *
 * Coverage:
 * - inactive: no polling while disconnected or without a public key
 * - loading: an in-flight check blocks overlapping checks
 * - success: a matching address leaves the session alone and resets the
 *   mismatch counter
 * - error: extension unavailable, account switched, repeated timeouts and
 *   repeated thrown errors all disconnect with the right message
 * - cleanup: unmounting or disconnecting stops the interval
 */
import { renderHook, act } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { useWalletResilience } from "../useWalletResilience";

const mockDisconnect = vi.fn();
const mockSetError = vi.fn();

vi.mock("../useWallet", () => ({
  useWallet: () => ({ disconnect: mockDisconnect, setError: mockSetError }),
}));

let storeState: {
  publicKey: string | null;
  network: "PUBLIC" | "TESTNET";
  connected: boolean;
};

vi.mock("../../store/walletStore", () => ({
  useWalletStore: () => storeState,
}));

vi.mock("../../services/logger", () => ({
  logger: { warn: vi.fn(), error: vi.fn() },
}));

const PUBLIC_KEY = "GABC123";
const CHECK_INTERVAL = 3000;
const CHECK_TIMEOUT = 5000;

const getAddress = vi.fn<() => Promise<{ address: string }>>();
const win = window as unknown as { freighter?: unknown };

// Advance to the next poll and flush the async check that follows.
const tick = async (ms = CHECK_INTERVAL) => {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
};

describe("useWalletResilience", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    storeState = { publicKey: PUBLIC_KEY, network: "TESTNET", connected: true };
    getAddress.mockResolvedValue({ address: PUBLIC_KEY });
    win.freighter = { getAddress };
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
    delete win.freighter;
  });

  describe("inactive", () => {
    it("does not poll when the wallet is disconnected", async () => {
      storeState = { ...storeState, connected: false };
      renderHook(() => useWalletResilience());

      await tick(CHECK_INTERVAL * 3);
      expect(getAddress).not.toHaveBeenCalled();
      expect(mockDisconnect).not.toHaveBeenCalled();
    });

    it("does not poll without a public key", async () => {
      storeState = { ...storeState, publicKey: null };
      renderHook(() => useWalletResilience());

      await tick(CHECK_INTERVAL * 3);
      expect(getAddress).not.toHaveBeenCalled();
    });
  });

  describe("loading", () => {
    it("skips overlapping checks while one is in flight", async () => {
      getAddress.mockReturnValue(new Promise(() => {}));
      renderHook(() => useWalletResilience());

      // Second tick lands while the first check waits on the 5s timeout.
      await tick();
      await tick();
      expect(getAddress).toHaveBeenCalledTimes(1);
    });
  });

  describe("success", () => {
    it("keeps the session when the extension reports the same address", async () => {
      renderHook(() => useWalletResilience());

      await tick();
      await tick();
      expect(getAddress).toHaveBeenCalledTimes(2);
      expect(mockDisconnect).not.toHaveBeenCalled();
      expect(mockSetError).not.toHaveBeenCalled();
    });

    it("resets the mismatch counter after a successful check", async () => {
      getAddress
        .mockRejectedValueOnce(new Error("flaky"))
        .mockResolvedValueOnce({ address: PUBLIC_KEY })
        .mockReturnValueOnce(new Promise(() => {}));
      renderHook(() => useWalletResilience());

      await tick();
      await tick();
      // Third check times out; without the reset this would be mismatch 2.
      await tick(CHECK_INTERVAL + CHECK_TIMEOUT);
      expect(getAddress).toHaveBeenCalledTimes(3);
      expect(mockDisconnect).not.toHaveBeenCalled();
    });
  });

  describe("error", () => {
    it("disconnects when the extension becomes unavailable", async () => {
      delete win.freighter;
      renderHook(() => useWalletResilience());

      await tick();
      expect(mockDisconnect).toHaveBeenCalledTimes(1);
      expect(mockSetError).toHaveBeenCalledWith(
        "Your wallet connection was lost. Please reconnect.",
      );
    });

    it("disconnects when the account is switched externally", async () => {
      getAddress.mockResolvedValue({ address: "GOTHER" });
      renderHook(() => useWalletResilience());

      await tick();
      expect(mockDisconnect).toHaveBeenCalledTimes(1);
      expect(mockSetError).toHaveBeenCalledWith(
        "Your wallet account was switched. Please reconnect with the correct account.",
      );
    });

    it("disconnects after repeated timeouts reaching the extension", async () => {
      getAddress.mockReturnValue(new Promise(() => {}));
      renderHook(() => useWalletResilience());

      // First check starts at 3s and times out at 8s (mismatch 1).
      await tick(CHECK_INTERVAL + CHECK_TIMEOUT);
      expect(mockDisconnect).not.toHaveBeenCalled();

      // Next check starts at 9s and times out at 14s (mismatch 2).
      await tick(CHECK_INTERVAL * 2);
      expect(mockDisconnect).toHaveBeenCalledTimes(1);
      expect(mockSetError).toHaveBeenCalledWith(
        "Wallet connection unstable. Please check your wallet extension and reconnect.",
      );
    });

    it("logs thrown errors and counts them towards the threshold", async () => {
      const { logger } = await import("../../services/logger");
      getAddress
        .mockRejectedValueOnce(new Error("boom"))
        .mockReturnValueOnce(new Promise(() => {}));
      renderHook(() => useWalletResilience());

      await tick();
      expect(logger.warn).toHaveBeenCalledWith(
        "hooks/useWalletResilience",
        "Wallet state check failed",
        undefined,
        expect.any(Error),
      );
      expect(mockDisconnect).not.toHaveBeenCalled();

      // The following timeout is mismatch 2, which triggers recovery.
      await tick(CHECK_INTERVAL + CHECK_TIMEOUT);
      expect(mockDisconnect).toHaveBeenCalledTimes(1);
      expect(mockSetError).toHaveBeenCalledWith(
        "Wallet connection unstable. Please check your wallet extension and reconnect.",
      );
    });
  });

  describe("cleanup", () => {
    it("stops polling on unmount", async () => {
      const clearSpy = vi.spyOn(globalThis, "clearInterval");
      const { unmount } = renderHook(() => useWalletResilience());

      await tick();
      expect(getAddress).toHaveBeenCalledTimes(1);

      unmount();
      expect(clearSpy).toHaveBeenCalled();

      await tick(CHECK_INTERVAL * 3);
      expect(getAddress).toHaveBeenCalledTimes(1);
    });

    it("stops polling when the wallet disconnects", async () => {
      const { rerender } = renderHook(() => useWalletResilience());

      await tick();
      expect(getAddress).toHaveBeenCalledTimes(1);

      storeState = { ...storeState, connected: false };
      rerender();

      await tick(CHECK_INTERVAL * 3);
      expect(getAddress).toHaveBeenCalledTimes(1);
    });
  });
});
