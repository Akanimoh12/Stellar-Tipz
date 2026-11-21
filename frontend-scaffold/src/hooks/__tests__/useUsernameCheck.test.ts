import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useUsernameCheck } from '../useUsernameCheck';

const mockGetProfileByUsername = vi.fn();

vi.mock('../useContract', () => ({
  useContract: () => ({
    getProfileByUsername: mockGetProfileByUsername,
  }),
}));

describe('useUsernameCheck debouncing', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    mockGetProfileByUsername.mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('debounces rapid keystrokes and only sends one request after the delay', async () => {
    mockGetProfileByUsername.mockRejectedValue(new Error('Profile not found'));

    const { result, rerender } = renderHook(({ username }) => useUsernameCheck(username, 300), {
      initialProps: { username: 'ali' },
    });

    act(() => {
      vi.advanceTimersByTime(100);
    });
    rerender({ username: 'alic' });

    act(() => {
      vi.advanceTimersByTime(100);
    });
    rerender({ username: 'alice' });

    // Still before the 300ms debounce window from the last keystroke
    expect(mockGetProfileByUsername).not.toHaveBeenCalled();

    await act(async () => {
      vi.advanceTimersByTime(300);
      await Promise.resolve();
    });

    expect(mockGetProfileByUsername).toHaveBeenCalledTimes(1);
    expect(mockGetProfileByUsername).toHaveBeenCalledWith('alice');
    expect(result.current.available).toBe(true);
    expect(result.current.checking).toBe(false);
  });

  it('ignores stale in-flight responses when username changes before resolution', async () => {
    let resolveFirst!: (value: unknown) => void;
    const firstPromise = new Promise((resolve) => {
      resolveFirst = resolve;
    });

    mockGetProfileByUsername
      .mockReturnValueOnce(firstPromise)
      .mockRejectedValueOnce(new Error('Profile not found'));

    const { result, rerender } = renderHook(({ username }) => useUsernameCheck(username, 300), {
      initialProps: { username: 'alice' },
    });

    // Trigger first request for "alice"
    await act(async () => {
      vi.advanceTimersByTime(300);
    });
    expect(mockGetProfileByUsername).toHaveBeenCalledWith('alice');

    // User types "alice_new" before first request settles
    rerender({ username: 'alice_new' });
    await act(async () => {
      vi.advanceTimersByTime(300);
      await Promise.resolve();
    });

    expect(result.current.available).toBe(true);

    // Now the stale "alice" (taken) response resolves — must be ignored
    await act(async () => {
      resolveFirst({ username: 'alice' });
      await Promise.resolve();
    });

    expect(result.current.available).toBe(true);
  });
});
