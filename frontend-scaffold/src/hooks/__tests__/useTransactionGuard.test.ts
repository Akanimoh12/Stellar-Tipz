import { renderHook, act, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { useTransactionGuard } from '../useTransactionGuard';

describe('useTransactionGuard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should return initial state', () => {
    const { result } = renderHook(() => useTransactionGuard());

    expect(result.current.isPending).toBe(false);
    expect(result.current.status).toBe('idle');
    expect(typeof result.current.startTransaction).toBe('function');
    expect(typeof result.current.reset).toBe('function');
  });

  it('should set isPending to true during transaction', async () => {
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
    expect(result.current.status).toBe('pending');

    // Resolve the transaction
    act(() => {
      resolveTransaction!();
    });

    await waitFor(() => {
      expect(result.current.isPending).toBe(false);
      expect(result.current.status).toBe('success');
    });
  });

  it('should reject duplicate submissions during pending transaction', async () => {
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

  it('should set status to error on transaction failure', async () => {
    const { result } = renderHook(() => useTransactionGuard());

    await act(async () => {
      try {
        await result.current.startTransaction(async () => {
          throw new Error('Transaction failed');
        });
      } catch {
        // Expected error
      }
    });

    expect(result.current.status).toBe('error');
    expect(result.current.isPending).toBe(false);
  });

  it('should reset state', async () => {
    const { result } = renderHook(() => useTransactionGuard());

    // Start a transaction
    await act(async () => {
      try {
        await result.current.startTransaction(async () => {
          throw new Error('Test error');
        });
      } catch {
        // Expected error
      }
    });

    expect(result.current.status).toBe('error');

    // Reset
    act(() => {
      result.current.reset();
    });

    expect(result.current.status).toBe('idle');
    expect(result.current.isPending).toBe(false);
  });

  it('should add beforeunload warning during pending transaction', async () => {
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
    const event = new Event('beforeunload') as BeforeUnloadEvent;
    Object.defineProperty(event, 'preventDefault', {
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

  it('should timeout and set error status after timeout period', async () => {
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

    expect(result.current.status).toBe('error');
    expect(result.current.isPending).toBe(false);

    vi.useRealTimers();
  });

  it('should clear timeout on successful transaction', async () => {
    vi.useFakeTimers();

    const { result } = renderHook(() => useTransactionGuard(1000));

    await act(async () => {
      await result.current.startTransaction(async () => {
        // Fast transaction
        return 'success';
      });
    });

    // Advance time past timeout - should not change status
    await act(async () => {
      vi.advanceTimersByTime(1001);
    });

    expect(result.current.status).toBe('success');

    vi.useRealTimers();
  });

  it('should return transaction result on success', async () => {
    const { result } = renderHook(() => useTransactionGuard());

    const transactionResult = await act(async () => {
      return result.current.startTransaction(async () => {
        return 'test-result';
      });
    });

    expect(transactionResult).toBe('test-result');
    expect(result.current.status).toBe('success');
  });
});
