import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  isFeatureEnabled,
  getFeatureValue,
  setRemoteFlags,
  subscribeToFlagChanges,
  initFlagService,
  fetchFlags,
  getFlagDebugInfo,
} from '../featureFlags';

beforeEach(() => {
  setRemoteFlags({});
  vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  localStorage.clear();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('featureFlags', () => {
  describe('isFeatureEnabled', () => {
    it('returns safe default (false) when flag is not set', () => {
      expect(isFeatureEnabled('nonexistent')).toBe(false);
    });

    it('returns true when remote flag is set to true', () => {
      setRemoteFlags({ 'my.feature': true });
      expect(isFeatureEnabled('my.feature')).toBe(true);
    });

    it('returns false when remote flag is set to false', () => {
      setRemoteFlags({ 'my.feature': false });
      expect(isFeatureEnabled('my.feature')).toBe(false);
    });

    it('respects custom default value', () => {
      expect(isFeatureEnabled('missing', true)).toBe(true);
    });

    it('coerces string "true" to true', () => {
      setRemoteFlags({ 'str.flag': 'true' });
      expect(isFeatureEnabled('str.flag')).toBe(true);
    });

    it('coerces number 0 to false', () => {
      setRemoteFlags({ 'num.flag': 0 });
      expect(isFeatureEnabled('num.flag')).toBe(false);
    });
  });

  describe('getFeatureValue', () => {
    it('returns undefined for missing flag with no default', () => {
      expect(getFeatureValue('missing')).toBeUndefined();
    });

    it('returns provided default for missing flag', () => {
      expect(getFeatureValue('missing', 42)).toBe(42);
    });

    it('returns remote value when set', () => {
      setRemoteFlags({ 'rollout.percent': 50 });
      expect(getFeatureValue('rollout.percent')).toBe(50);
    });
  });

  describe('subscribeToFlagChanges', () => {
    it('notifies when remote flags change via setRemoteFlags', () => {
      const spy = vi.fn();
      const unsub = subscribeToFlagChanges(spy);
      setRemoteFlags({ a: true });
      expect(spy).toHaveBeenCalledTimes(1);
      unsub();
    });

    it('does not notify after unsubscribe', () => {
      const spy = vi.fn();
      const unsub = subscribeToFlagChanges(spy);
      unsub();
      setRemoteFlags({ a: true });
      expect(spy).not.toHaveBeenCalled();
    });
  });

  describe('fetchFlags', () => {
    it('falls back to safe defaults on fetch failure', async () => {
      vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network')));
      initFlagService({ endpoint: 'https://flags.example.com/api' });
      await fetchFlags();
      // Should not throw, feature should be off
      expect(isFeatureEnabled('any.feature')).toBe(false);
      vi.unstubAllGlobals();
    });

    it('updates remote flags on successful fetch', async () => {
      const mockResponse = {
        ok: true,
        json: () => Promise.resolve({ 'new.feature': true, 'rollout': 75 }),
      };
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(mockResponse));
      initFlagService({ endpoint: 'https://flags.example.com/api' });
      await fetchFlags();
      expect(isFeatureEnabled('new.feature')).toBe(true);
      expect(getFeatureValue('rollout')).toBe(75);
      vi.unstubAllGlobals();
    });

    it('includes userId in request when configured', async () => {
      const fetchSpy = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({}),
      });
      vi.stubGlobal('fetch', fetchSpy);
      initFlagService({ endpoint: 'https://flags.example.com/api', userId: 'user-123' });
      await fetchFlags();
      const calledUrl = fetchSpy.mock.calls[fetchSpy.mock.calls.length - 1][0] as string;
      expect(calledUrl).toContain('userId=user-123');
      vi.unstubAllGlobals();
    });

    it('writes to localStorage cache on success', async () => {
      const mockResponse = {
        ok: true,
        json: () => Promise.resolve({ cached: true }),
      };
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(mockResponse));
      initFlagService({ endpoint: 'https://flags.example.com/api' });
      await fetchFlags();
      const cached = JSON.parse(localStorage.getItem('tipz_flags_cache') ?? '{}');
      expect(cached.cached).toBe(true);
      vi.unstubAllGlobals();
    });

    it('loads from cache on fetch failure after previous success', async () => {
      // Seed cache
      localStorage.setItem('tipz_flags_cache', JSON.stringify({ 'cached.flag': true }));
      localStorage.setItem('tipz_flags_cache_ts', String(Date.now()));

      vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));
      initFlagService({ endpoint: 'https://flags.example.com/api' });
      await fetchFlags();
      // Should have loaded from cache
      expect(isFeatureEnabled('cached.flag')).toBe(true);
      vi.unstubAllGlobals();
    });
  });

  describe('getFlagDebugInfo', () => {
    it('returns structured debug info', () => {
      setRemoteFlags({ debug: true });
      const info = getFlagDebugInfo();
      expect(info).toHaveProperty('envFlags');
      expect(info).toHaveProperty('remoteFlags');
      expect(info).toHaveProperty('cacheAge');
      expect(info).toHaveProperty('userId');
      expect(info).toHaveProperty('lastFetchError');
      expect(info).toHaveProperty('lastFetchTime');
      expect(info.remoteFlags.debug).toBe(true);
    });
  });
});
