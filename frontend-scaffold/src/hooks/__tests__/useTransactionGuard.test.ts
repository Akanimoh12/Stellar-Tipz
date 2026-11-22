import { renderHook, act, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  useTransactionGuard,
  NAVIGATION_CONFIRM_MESSAGE,
} from "../useTransactionGuard";

describe("useTransactionGuard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sessionStorage.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    sessionStorage.clear();
  });

  it("should return initial state", () => {
    const { result } = renderHook(() => useTransactionGuard());

    expect(result.current.isPending).toBe(false);
    expect(result.current.status).toBe("idle");
    expect(typeof result.current.startTransaction).toBe("function");
    expect(typeof result.current.reset).toBe("function");
  });

  it("should set isPending to true during transaction", async () => {
    const { result } = renderHook(() => useTransactionGuard());

    let resolveTransaction: () => void;
    const transactionPromise = new Promise<void>((resolve) => {
      resolveTransaction = resolve;
    });

    // Start transaction but don't await yet
    let transactionStarted = false;
    act(() => {
      result.current.startTransaction(async () => {
        transactionStarted = true;
        await transactionPromise;
      });
    });

    await waitFor(() => {
      expect(transactionStarted).toBe(true);
    });

    expect(result.current.isPending).toBe(true);
    expect(result.current.status).toBe("pending");

    // Resolve the transaction
    act(() => {
      resolveTransaction!();
    });

    await waitFor(() => {
      expect(result.current.isPending).toBe(false);
      expect(result.current.status).toBe("success");
    });
  });

  it("should reject duplicate submissions during pending transaction", async () => {
    const { result } = renderHook(() => useTransactionGuard());

    let resolveFirst: () => void;
    const firstPromise = new Promise<void>((resolve) => {
      resolveFirst = resolve;
    });

    const mockTransaction = vi.fn();

    // Start first transaction
    await act(async () => {
      result.current.startTransaction(async () => {
        mockTransaction();
        await firstPromise;
      });
    });

    expect(result.current.isPending).toBe(true);

    // Try to start second transaction while first is pending
    const secondResult = await result.current.startTransaction(async () => {
      mockTransaction();
    });

    // Second transaction should be rejected
    expect(secondResult).toBeNull();
    expect(mockTransaction).toHaveBeenCalledTimes(1);

    // Resolve first transaction
    act(() => {
      resolveFirst!();
    });

    await waitFor(() => {
      expect(result.current.isPending).toBe(false);
    });
  });

  it("should set status to error on transaction failure", async () => {
    const { result } = renderHook(() => useTransactionGuard());

    await act(async () => {
      try {
        await result.current.startTransaction(async () => {
          throw new Error("Transaction failed");
        });
      } catch {
        // Expected error
      }
    });

    expect(result.current.status).toBe("error");
    expect(result.current.isPending).toBe(false);
  });

  it("should reset state", async () => {
    const { result } = renderHook(() => useTransactionGuard());

    // Start a transaction
    await act(async () => {
      try {
        await result.current.startTransaction(async () => {
          throw new Error("Test error");
        });
      } catch {
        // Expected error
      }
    });

    expect(result.current.status).toBe("error");

    // Reset
    act(() => {
      result.current.reset();
    });

    expect(result.current.status).toBe("idle");
    expect(result.current.isPending).toBe(false);
  });

  it("should add beforeunload warning during pending transaction", async () => {
    const { result, unmount } = renderHook(() => useTransactionGuard());

    let resolveTransaction: () => void;
    const transactionPromise = new Promise<void>((resolve) => {
      resolveTransaction = resolve;
    });

    // Start transaction
    await act(async () => {
      result.current.startTransaction(async () => {
        await transactionPromise;
      });
    });

    expect(result.current.isPending).toBe(true);

    // Manually trigger beforeunload event
    const event = new Event("beforeunload") as BeforeUnloadEvent;
    Object.defineProperty(event, "preventDefault", {
      value: vi.fn(),
      writable: true,
    });

    window.dispatchEvent(event);

    // Resolve transaction
    act(() => {
      resolveTransaction!();
    });

    await waitFor(() => {
      expect(result.current.isPending).toBe(false);
    });

    unmount();
  });

  it("should timeout and set error status after timeout period", async () => {
    vi.useFakeTimers();

    const { result } = renderHook(() => useTransactionGuard(1000)); // 1 second timeout

    // Start a transaction that never resolves
    await act(async () => {
      result.current.startTransaction(async () => {
        await new Promise(() => {}); // Never resolves
      });
    });

    expect(result.current.isPending).toBe(true);

    // Advance time past timeout
    await act(async () => {
      vi.advanceTimersByTime(1001);
    });

    expect(result.current.status).toBe("error");
    expect(result.current.isPending).toBe(false);

    vi.useRealTimers();
  });

  it("should clear timeout on successful transaction", async () => {
    vi.useFakeTimers();

    const { result } = renderHook(() => useTransactionGuard(1000));

    await act(async () => {
      await result.current.startTransaction(async () => {
        // Fast transaction
        return "success";
      });
    });

    // Advance time past timeout - should not change status
    await act(async () => {
      vi.advanceTimersByTime(1001);
    });

    expect(result.current.status).toBe("success");

    vi.useRealTimers();
  });

  it("should return transaction result on success", async () => {
    const { result } = renderHook(() => useTransactionGuard());

    const transactionResult = await act(async () => {
      return result.current.startTransaction(async () => {
        return "test-result";
      });
    });

    expect(transactionResult).toBe("test-result");
    expect(result.current.status).toBe("success");
  });

  it("should persist pending state to sessionStorage during a transaction", async () => {
    const { result } = renderHook(() => useTransactionGuard());

    let resolveTransaction: () => void;
    const transactionPromise = new Promise<void>((resolve) => {
      resolveTransaction = resolve;
    });

    await act(async () => {
      result.current.startTransaction(async () => {
        await transactionPromise;
      });
    });

    const raw = sessionStorage.getItem("tipz_tx_guard_v1");
    expect(raw).not.toBeNull();
    const parsed = JSON.parse(raw!);
    expect(parsed.version).toBe(1);
    expect(typeof parsed.startedAt).toBe("number");
    expect(parsed.timeoutMs).toBe(120_000);

    act(() => {
      resolveTransaction!();
    });

    await waitFor(() => {
      expect(result.current.status).toBe("success");
    });
    expect(sessionStorage.getItem("tipz_tx_guard_v1")).toBeNull();
  });

  it("should clear persisted state on transaction error", async () => {
    const { result } = renderHook(() => useTransactionGuard());

    await act(async () => {
      try {
        await result.current.startTransaction(async () => {
          throw new Error("boom");
        });
      } catch {
        // expected
      }
    });

    expect(result.current.status).toBe("error");
    expect(sessionStorage.getItem("tipz_tx_guard_v1")).toBeNull();
  });

  it("should clear persisted state on transaction success", async () => {
    const { result } = renderHook(() => useTransactionGuard());

    await act(async () => {
      await result.current.startTransaction(async () => "ok");
    });

    expect(result.current.status).toBe("success");
    expect(sessionStorage.getItem("tipz_tx_guard_v1")).toBeNull();
  });

  it("should restore pending state after a page refresh", async () => {
    // Simulate a transaction that was in-flight right before the reload.
    sessionStorage.setItem(
      "tipz_tx_guard_v1",
      JSON.stringify({
        version: 1,
        startedAt: Date.now() - 1_000,
        timeoutMs: 120_000,
      }),
    );

    const { result } = renderHook(() => useTransactionGuard());

    await waitFor(() => {
      expect(result.current.status).toBe("pending");
    });
    expect(result.current.isPending).toBe(true);
    expect(result.current.restored).toBe(true);
  });

  it("should not restore an expired persisted transaction", async () => {
    sessionStorage.setItem(
      "tipz_tx_guard_v1",
      JSON.stringify({
        version: 1,
        startedAt: Date.now() - 200_000,
        timeoutMs: 120_000,
      }),
    );

    const { result } = renderHook(() => useTransactionGuard());

    expect(result.current.status).toBe("idle");
    expect(result.current.restored).toBe(false);
    expect(sessionStorage.getItem("tipz_tx_guard_v1")).toBeNull();
  });

  it("should reject duplicate submissions while a restored transaction is pending", async () => {
    sessionStorage.setItem(
      "tipz_tx_guard_v1",
      JSON.stringify({
        version: 1,
        startedAt: Date.now() - 1_000,
        timeoutMs: 120_000,
      }),
    );

    const { result } = renderHook(() => useTransactionGuard());

    await waitFor(() => {
      expect(result.current.restored).toBe(true);
    });

    const mockTransaction = vi.fn();
    const secondResult = await result.current.startTransaction(async () => {
      mockTransaction();
    });

    expect(secondResult).toBeNull();
    expect(mockTransaction).not.toHaveBeenCalled();
  });

  it("should reset restored state when reset is called", async () => {
    sessionStorage.setItem(
      "tipz_tx_guard_v1",
      JSON.stringify({
        version: 1,
        startedAt: Date.now() - 1_000,
        timeoutMs: 120_000,
      }),
    );

    const { result } = renderHook(() => useTransactionGuard());

    await waitFor(() => {
      expect(result.current.restored).toBe(true);
    });

    act(() => {
      result.current.reset();
    });

    expect(result.current.status).toBe("idle");
    expect(result.current.restored).toBe(false);
    expect(result.current.isPending).toBe(false);
  });

  it("should set status to error when a restored transaction times out", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:00:00Z"));

    sessionStorage.setItem(
      "tipz_tx_guard_v1",
      JSON.stringify({
        version: 1,
        startedAt: Date.now() - 119_000,
        timeoutMs: 120_000,
      }),
    );

    const { result } = renderHook(() => useTransactionGuard());

    expect(result.current.restored).toBe(true);
    expect(result.current.status).toBe("pending");

    await act(async () => {
      vi.advanceTimersByTime(2_000);
    });

    expect(result.current.status).toBe("error");
    expect(result.current.isPending).toBe(false);
    expect(sessionStorage.getItem("tipz_tx_guard_v1")).toBeNull();

    vi.useRealTimers();
  });

  it("should export the navigation confirmation message", () => {
    expect(NAVIGATION_CONFIRM_MESSAGE).toContain("transaction is in progress");
  });
});
