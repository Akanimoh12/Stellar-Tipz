/**
 * #1311 — Tests for offline support, cached reads, network action guards, and reconnection.
 */

import React from 'react';
import { render, screen, act, fireEvent, renderHook, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { useOfflineStatus } from '../useOfflineStatus';
import { useCachedRead } from '../useCachedRead';
import { useNetworkAction, OFFLINE_ACTION_DISABLED_MESSAGE } from '../useNetworkAction';
import NetworkActionGuard from '@/components/shared/NetworkActionGuard';
import StalenessIndicator from '@/components/shared/StalenessIndicator';
import OfflineBanner from '@/components/shared/OfflineBanner';

function setOffline(offline: boolean) {
  Object.defineProperty(navigator, 'onLine', {
    value: !offline,
    writable: true,
    configurable: true,
  });
  act(() => {
    window.dispatchEvent(new Event(offline ? 'offline' : 'online'));
  });
}

describe('Offline Support & Graceful Handling (#1311)', () => {
  beforeEach(() => {
    localStorage.clear();
    setOffline(false);
  });

  afterEach(() => {
    setOffline(false);
    localStorage.clear();
  });

  describe('1. Offline & Online Reconnection Detection', () => {
    it('detects online vs offline state reactively', () => {
      setOffline(false);
      const { result } = renderHook(() => useOfflineStatus());
      expect(result.current.isOnline).toBe(true);
      expect(result.current.isOffline).toBe(false);

      act(() => setOffline(true));
      expect(result.current.isOffline).toBe(true);
      expect(result.current.isOnline).toBe(false);

      act(() => setOffline(false));
      expect(result.current.isOnline).toBe(true);
    });

    it('renders OfflineBanner only when offline', () => {
      setOffline(false);
      const { unmount } = render(<OfflineBanner customMessage="You are currently offline" />);
      expect(screen.queryByText(/currently offline/i)).not.toBeInTheDocument();
      unmount();

      setOffline(true);
      render(<OfflineBanner customMessage="You are currently offline" />);
      expect(screen.getByText(/currently offline/i)).toBeInTheDocument();
    });
  });

  describe('2. Read-Only Views with Cached Data and Staleness Indicator', () => {
    it('serves fresh data online and caches it for offline fallback', async () => {
      const mockFetcher = vi.fn().mockResolvedValue({ balance: '150.00 XLM' });

      const { result } = renderHook(() =>
        useCachedRead({
          key: 'user_balance',
          fetcher: mockFetcher,
        }),
      );

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.data).toEqual({ balance: '150.00 XLM' });
      expect(result.current.isStale).toBe(false);

      // Go offline
      act(() => setOffline(true));

      const { result: offlineResult } = renderHook(() =>
        useCachedRead({
          key: 'user_balance',
          fetcher: mockFetcher,
        }),
      );

      expect(offlineResult.current.data).toEqual({ balance: '150.00 XLM' });
      expect(offlineResult.current.isStale).toBe(true);
      expect(offlineResult.current.cachedAt).toBeInstanceOf(Date);
    });

    it('renders StalenessIndicator with cached timestamp and refresh action', () => {
      const past = new Date('2026-05-01T12:00:00Z');
      const onRefresh = vi.fn();

      render(
        <StalenessIndicator
          isStale={true}
          cachedAt={past}
          onRefresh={onRefresh}
        />,
      );

      expect(screen.getByRole('note')).toHaveTextContent(/cached data/i);

      const refreshBtn = screen.getByRole('button', { name: /refresh data/i });
      fireEvent.click(refreshBtn);
      expect(onRefresh).toHaveBeenCalledTimes(1);
    });
  });

  describe('3. Disabled Actions Requiring Network with Explanation', () => {
    it('disables action execution and throws explanatory message when offline', async () => {
      setOffline(true);
      const { result } = renderHook(() => useNetworkAction());

      expect(result.current.disabled).toBe(true);
      expect(result.current.disabledReason).toContain('Internet connection required');
      expect(result.current.disabledReason).toContain('Blockchain transactions cannot be queued offline');

      const action = vi.fn().mockResolvedValue('success');
      await expect(result.current.execute(action)).rejects.toThrow(/Internet connection required/i);
      expect(action).not.toHaveBeenCalled();
    });

    it('allows action execution when online', async () => {
      setOffline(false);
      const { result } = renderHook(() => useNetworkAction());

      expect(result.current.disabled).toBe(false);
      expect(result.current.disabledReason).toBeUndefined();

      const action = vi.fn().mockResolvedValue('success');
      const res = await result.current.execute(action);
      expect(res).toBe('success');
      expect(action).toHaveBeenCalledTimes(1);
    });

    it('NetworkActionGuard renders explanation banner and disables interaction when offline', () => {
      setOffline(true);
      const onButtonClick = vi.fn();

      render(
        <NetworkActionGuard>
          <button onClick={onButtonClick}>Send On-Chain Tip</button>
        </NetworkActionGuard>,
      );

      expect(screen.getByRole('alert')).toHaveTextContent(OFFLINE_ACTION_DISABLED_MESSAGE);
      expect(screen.getByText('Send On-Chain Tip')).toBeInTheDocument();
    });
  });
});
