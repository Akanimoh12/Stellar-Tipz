import { renderHook, act, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { useRpcHealth } from '../useRpcHealth';
import { env } from '@/helpers/env';

vi.mock('@/helpers/env', () => ({
  env: {
    sorobanRpcUrl: 'https://soroban-testnet.stellar.org',
  },
}));

describe('useRpcHealth', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    global.fetch = originalFetch;
  });

  it('should start with initial checking state and transition to healthy on successful check', async () => {
    const mockResponse = {
      ok: true,
      json: vi.fn().mockResolvedValue({ jsonrpc: '2.0', id: 1, result: { status: 'healthy' } }),
    };
    global.fetch = vi.fn().mockResolvedValue(mockResponse as unknown as Response);

    const { result } = renderHook(() => useRpcHealth());

    expect(result.current.isHealthy).toBe(true);
    expect(result.current.isChecking).toBe(true);

    await act(async () => {
      await vi.runOnlyPendingTimersAsync();
    });

    expect(global.fetch).toHaveBeenCalledWith(
      env.sorobanRpcUrl,
      expect.objectContaining({
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      }),
    );
    expect(result.current.isHealthy).toBe(true);
    expect(result.current.isChecking).toBe(false);
    expect(result.current.lastChecked).not.toBeNull();
  });

  it('should mark status as unhealthy when RPC endpoint returns non-ok response', async () => {
    const mockResponse = {
      ok: false,
      status: 503,
    };
    global.fetch = vi.fn().mockResolvedValue(mockResponse as unknown as Response);

    const { result } = renderHook(() => useRpcHealth());

    await act(async () => {
      await vi.runOnlyPendingTimersAsync();
    });

    expect(result.current.isHealthy).toBe(false);
    expect(result.current.isChecking).toBe(false);
    expect(result.current.lastChecked).not.toBeNull();
  });

  it('should mark status as unhealthy when fetch network error occurs', async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error('Network connection refused'));

    const { result } = renderHook(() => useRpcHealth());

    await act(async () => {
      await vi.runOnlyPendingTimersAsync();
    });

    expect(result.current.isHealthy).toBe(false);
    expect(result.current.isChecking).toBe(false);
    expect(result.current.lastChecked).not.toBeNull();
  });

  it('should periodically poll health every 30 seconds', async () => {
    let callCount = 0;
    global.fetch = vi.fn().mockImplementation(async () => {
      callCount += 1;
      return { ok: true } as Response;
    });

    const { result } = renderHook(() => useRpcHealth());

    await act(async () => {
      await vi.runOnlyPendingTimersAsync();
    });
    expect(callCount).toBe(1);

    // Advance 30 seconds to trigger interval check
    await act(async () => {
      await vi.advanceTimersByTimeAsync(30000);
    });

    expect(callCount).toBe(2);
    expect(result.current.isHealthy).toBe(true);
  });

  it('should clear interval on unmount', async () => {
    const clearIntervalSpy = vi.spyOn(global, 'clearInterval');
    global.fetch = vi.fn().mockResolvedValue({ ok: true } as Response);

    const { unmount } = renderHook(() => useRpcHealth());

    await act(async () => {
      await vi.runOnlyPendingTimersAsync();
    });

    unmount();
    expect(clearIntervalSpy).toHaveBeenCalled();
  });
});
