import { renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useXlmPrice } from '../useXlmPrice';

describe('useXlmPrice', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    vi.restoreAllMocks();
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    global.fetch = originalFetch;
  });

  it('treats an absent price as unavailable', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ stellar: {} }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const { result } = renderHook(() => useXlmPrice());

    await waitFor(() => {
      expect(result.current.price).toBeNull();
    });
  });

  it('refetches when the cached price is older than the allowed age', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ stellar: { usd: 0.42 } }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const { result, rerender } = renderHook(() => useXlmPrice());
    await waitFor(() => {
      expect(result.current.price).toBe(0.42);
    });

    // Simulate the cache being stale beyond the 5-minute threshold.
    const originalNow = Date.now;
    Date.now = vi.fn(() => originalNow() + 6 * 60 * 1000);
    rerender();

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(2);
    });

    Date.now = originalNow;
  });
});
