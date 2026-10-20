import { renderHook, act, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { useQuery } from '../useQuery';
import { queryCache } from '../../lib/queryCache';

describe('useQuery', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    queryCache.invalidate(); // Clear entire query cache between tests
  });

  afterEach(() => {
    queryCache.invalidate();
  });

  it('should start in loading state when enabled', async () => {
    const fetcher = vi.fn().mockImplementation(
      () => new Promise((resolve) => setTimeout(() => resolve('data'), 50)),
    );

    const { result } = renderHook(() => useQuery('test-loading-key', fetcher));

    expect(result.current.loading).toBe(true);
    expect(result.current.data).toBeNull();
    expect(result.current.error).toBeNull();

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.data).toBe('data');
  });

  it('should not fetch and immediately set loading to false when enabled is false', async () => {
    const fetcher = vi.fn().mockResolvedValue('test-data');

    const { result } = renderHook(() =>
      useQuery('disabled-key', fetcher, { enabled: false }),
    );

    expect(result.current.loading).toBe(false);
    expect(result.current.data).toBeNull();
    expect(result.current.error).toBeNull();
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('should successfully fetch, cache, and populate data', async () => {
    const mockData = { id: 1, name: 'Stellar Item' };
    const fetcher = vi.fn().mockResolvedValue(mockData);

    const { result } = renderHook(() => useQuery('success-key', fetcher));

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.data).toEqual(mockData);
    expect(result.current.error).toBeNull();
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it('should handle fetch errors and populate error state', async () => {
    const error = new Error('Query fetch failed');
    const fetcher = vi.fn().mockRejectedValue(error);

    const { result } = renderHook(() =>
      useQuery('error-key', fetcher, { retry: 0 }),
    );

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.data).toBeNull();
    expect(result.current.error).toEqual(error);
  });

  it('should support manual refetch', async () => {
    let callCount = 0;
    const fetcher = vi.fn().mockImplementation(async () => {
      callCount += 1;
      return `result-${callCount}`;
    });

    const { result } = renderHook(() =>
      useQuery('refetch-key', fetcher, { staleTime: 60000 }),
    );

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });
    expect(result.current.data).toBe('result-1');

    await act(async () => {
      await result.current.refetch();
    });

    expect(result.current.data).toBe('result-2');
  });

  it('should re-execute query when cache key is invalidated via subscription', async () => {
    let value = 'initial';
    const fetcher = vi.fn().mockImplementation(async () => value);

    const { result } = renderHook(() => useQuery('subscribe-key', fetcher));

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });
    expect(result.current.data).toBe('initial');

    value = 'updated';
    act(() => {
      queryCache.invalidate('subscribe-key');
    });

    await waitFor(() => {
      expect(result.current.data).toBe('updated');
    });
  });

  it('should unsubscribe and avoid state updates after unmount', async () => {
    const fetcher = vi.fn().mockImplementation(
      () => new Promise((resolve) => setTimeout(() => resolve('slow-data'), 100)),
    );

    const { result, unmount } = renderHook(() => useQuery('unmount-key', fetcher));

    expect(result.current.loading).toBe(true);

    // Unmount before fetch finishes
    unmount();

    // Trigger cache invalidation after unmount - should not throw or update unmounted component
    expect(() => {
      queryCache.invalidate('unmount-key');
    }).not.toThrow();
  });
});
