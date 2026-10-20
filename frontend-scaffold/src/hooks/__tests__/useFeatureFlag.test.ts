import { renderHook, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { useFeatureFlag, useFeatureValue, useFeatureFlagDebug } from '../useFeatureFlag';
import { setRemoteFlags } from '@/services/featureFlags';

beforeEach(() => {
  setRemoteFlags({});
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('useFeatureFlag', () => {
  it('returns default false when flag is not set', () => {
    const { result } = renderHook(() => useFeatureFlag('missing'));
    expect(result.current).toBe(false);
  });

  it('returns true when remote flag is enabled', () => {
    setRemoteFlags({ 'test.flag': true });
    const { result } = renderHook(() => useFeatureFlag('test.flag'));
    expect(result.current).toBe(true);
  });

  it('updates when remote flags change', () => {
    const { result } = renderHook(() => useFeatureFlag('dynamic'));
    expect(result.current).toBe(false);

    act(() => {
      setRemoteFlags({ dynamic: true });
    });

    expect(result.current).toBe(true);
  });

  it('respects custom default value', () => {
    const { result } = renderHook(() => useFeatureFlag('missing', true));
    expect(result.current).toBe(true);
  });
});

describe('useFeatureValue', () => {
  it('returns undefined for missing flag', () => {
    const { result } = renderHook(() => useFeatureValue('missing'));
    expect(result.current).toBeUndefined();
  });

  it('returns the default value when provided', () => {
    const { result } = renderHook(() => useFeatureValue('missing', 42));
    expect(result.current).toBe(42);
  });

  it('returns numeric remote value', () => {
    setRemoteFlags({ percent: 75 });
    const { result } = renderHook(() => useFeatureValue('percent'));
    expect(result.current).toBe(75);
  });
});

describe('useFeatureFlagDebug', () => {
  it('returns debug info with expected structure', () => {
    setRemoteFlags({ 'debug.test': true });
    const { result } = renderHook(() => useFeatureFlagDebug());
    expect(result.current).toHaveProperty('envFlags');
    expect(result.current).toHaveProperty('remoteFlags');
    expect(result.current).toHaveProperty('cacheAge');
    expect(result.current).toHaveProperty('userId');
    expect(result.current).toHaveProperty('lastFetchError');
    expect(result.current.remoteFlags['debug.test']).toBe(true);
  });

  it('updates debug info when flags change', () => {
    const { result } = renderHook(() => useFeatureFlagDebug());
    expect(result.current.remoteFlags).toEqual({});

    act(() => {
      setRemoteFlags({ updated: true });
    });

    expect(result.current.remoteFlags.updated).toBe(true);
  });
});
