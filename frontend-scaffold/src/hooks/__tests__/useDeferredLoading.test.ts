import { renderHook, act } from '@testing-library/react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { useDeferredLoading } from '../useDeferredLoading';

afterEach(() => {
  vi.useRealTimers();
});

describe('useDeferredLoading', () => {
  it('returns false initially when loading is true', () => {
    const { result } = renderHook(() => useDeferredLoading(true, 200));
    expect(result.current).toBe(false);
  });

  it('returns true after delay when still loading', () => {
    vi.useFakeTimers();
    const { result } = renderHook(() => useDeferredLoading(true, 200));
    expect(result.current).toBe(false);

    act(() => {
      vi.advanceTimersByTime(250);
    });

    expect(result.current).toBe(true);
  });

  it('returns false immediately when loading becomes false', () => {
    vi.useFakeTimers();
    const { result, rerender } = renderHook(
      ({ loading }: { loading: boolean }) => useDeferredLoading(loading, 200),
      { initialProps: { loading: true } },
    );

    act(() => {
      vi.advanceTimersByTime(250);
    });
    expect(result.current).toBe(true);

    rerender({ loading: false });
    expect(result.current).toBe(false);
  });

  it('does not flash skeleton on fast loads (loading false before delay)', () => {
    vi.useFakeTimers();
    const { result, rerender } = renderHook(
      ({ loading }: { loading: boolean }) => useDeferredLoading(loading, 200),
      { initialProps: { loading: true } },
    );

    // Loading finishes before delay
    act(() => {
      vi.advanceTimersByTime(100);
    });
    rerender({ loading: false });

    expect(result.current).toBe(false);

    // Even after more time, still false
    act(() => {
      vi.advanceTimersByTime(200);
    });
    expect(result.current).toBe(false);
  });
});
