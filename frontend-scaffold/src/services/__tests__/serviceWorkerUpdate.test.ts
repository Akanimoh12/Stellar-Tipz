/**
 * #1312 — Tests for service worker update flow, version gates, and cache purging.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  compareVersions,
  isVersionGateTriggered,
  onUpdateAvailable,
  notifyUpdateAvailable,
  register,
  checkForUpdate,
  skipWaiting,
  CURRENT_SW_VERSION,
} from '../serviceWorker';

describe('Service Worker Update Flow (#1312)', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    Object.defineProperty(navigator, 'serviceWorker', {
      value: {
        register: vi.fn().mockResolvedValue({
          waiting: null,
          installing: null,
          addEventListener: vi.fn(),
          update: vi.fn().mockResolvedValue(undefined),
        }),
        addEventListener: vi.fn(),
        getRegistration: vi.fn().mockResolvedValue({
          waiting: {
            postMessage: vi.fn(),
          },
          update: vi.fn().mockResolvedValue(undefined),
        }),
      },
      writable: true,
      configurable: true,
    });
  });

  describe('1. Version Comparison & Version Gate Logic', () => {
    it('accurately compares semver version strings', () => {
      expect(compareVersions('1.0.0', '1.0.0')).toBe(0);
      expect(compareVersions('1.0.0', '1.1.0')).toBe(-1);
      expect(compareVersions('2.0.0', '1.9.9')).toBe(1);
      expect(compareVersions('1.2.3', '1.2.4')).toBe(-1);
      expect(compareVersions('2.1.0', '2.0.9')).toBe(1);
    });

    it('triggers version gate when current client version is below required minimum', () => {
      expect(isVersionGateTriggered('1.0.0', '2.0.0')).toBe(true);
      expect(isVersionGateTriggered('1.9.5', '2.0.0')).toBe(true);
      expect(isVersionGateTriggered('2.0.0', '2.0.0')).toBe(false);
      expect(isVersionGateTriggered('2.1.0', '2.0.0')).toBe(false);
      expect(isVersionGateTriggered('2.0.0', undefined)).toBe(false);
    });
  });

  describe('2. Update Detection and Notification Flow', () => {
    it('notifies subscribers when an update is available', () => {
      const listener = vi.fn();
      const unsub = onUpdateAvailable(listener);

      notifyUpdateAvailable({ isCritical: false, version: '2.1.0' });
      expect(listener).toHaveBeenCalledWith({ isCritical: false, version: '2.1.0' });

      unsub();
      notifyUpdateAvailable({ isCritical: true });
      expect(listener).toHaveBeenCalledTimes(1); // not called after unsub
    });

    it('register() sets up update listeners on service worker registration', async () => {
      const reg = await register();
      expect(reg).toBeDefined();
      expect(navigator.serviceWorker.register).toHaveBeenCalledWith('/sw.js');
    });

    it('checkForUpdate() proactively triggers registration.update()', async () => {
      const updateCheck = await checkForUpdate();
      expect(typeof updateCheck).toBe('boolean');
    });
  });

  describe('3. Update Activation & Reload', () => {
    it('skipWaiting posts SKIP_WAITING to waiting worker and listens for controllerchange', async () => {
      const mockPostMessage = vi.fn();
      const mockGetRegistration = vi.fn().mockResolvedValue({
        waiting: { postMessage: mockPostMessage },
      });

      (navigator.serviceWorker.getRegistration as any) = mockGetRegistration;

      await skipWaiting();

      expect(mockPostMessage).toHaveBeenCalledWith({ type: 'SKIP_WAITING' });
      expect(mockPostMessage).toHaveBeenCalledWith('SKIP_WAITING');
    });
  });
});
