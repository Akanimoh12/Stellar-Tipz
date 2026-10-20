import { renderHook, act, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { useTipNotifications, useNotificationPreferences } from '../useTipNotifications';
import { useContract } from '../useContract';
import type { Tip } from '@/types/contract';
import { logger } from '@/services/logger';

vi.mock('../useContract');
vi.mock('@/services/logger');

const mockUseContract = vi.mocked(useContract);
const mockLogger = vi.mocked(logger);

const mockTip: Tip = {
  id: 1,
  tipper: 'GDOZV3D6O4BT7OVVHWV3E2BFG4LZPVYHZQ2ZQVZQ2ZQVZQ2ZQVZQ2ZQ',
  creator: 'GC3JWRMQHG7QZRZDL7ZLWX7YLGQ7YLGQ7YLGQ7YLGQ7YLGQ7YLGQ7Y',
  amount: '1000000',
  message: 'Great content!',
  isEncrypted: false,
  timestamp: Math.floor(Date.now() / 1000),
};

describe('useNotificationPreferences', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should return default notification settings', () => {
    const { result } = renderHook(() => useNotificationPreferences());

    expect(result.current.settings).toEqual({
      sound: true,
      desktop: false,
    });
  });

  it('should load saved notification settings from localStorage', () => {
    localStorage.setItem(
      'tipz_notification_settings',
      JSON.stringify({ sound: false, desktop: true }),
    );

    const { result } = renderHook(() => useNotificationPreferences());

    expect(result.current.settings).toEqual({
      sound: false,
      desktop: true,
    });
  });

  it('should update notification settings', () => {
    const { result } = renderHook(() => useNotificationPreferences());

    act(() => {
      result.current.updateSettings({ sound: false });
    });

    expect(result.current.settings.sound).toBe(false);
    expect(result.current.settings.desktop).toBe(false);
    expect(localStorage.getItem('tipz_notification_settings')).toContain('"sound":false');
  });

  it('should merge partial setting updates', () => {
    const { result } = renderHook(() => useNotificationPreferences());

    act(() => {
      result.current.updateSettings({ desktop: true });
    });

    expect(result.current.settings).toEqual({
      sound: true,
      desktop: true,
    });
  });

  it('should handle invalid localStorage data gracefully', () => {
    localStorage.setItem('tipz_notification_settings', 'invalid json');

    const { result } = renderHook(() => useNotificationPreferences());

    expect(result.current.settings).toEqual({
      sound: true,
      desktop: false,
    });
  });
});

describe('useTipNotifications', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    vi.useFakeTimers();

    mockUseContract.mockReturnValue({
      getRecentTips: vi.fn(),
    } as unknown as ReturnType<typeof useContract>);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('should return initial state', () => {
    mockUseContract.mockReturnValue({
      getRecentTips: vi.fn().mockResolvedValue([]),
    } as unknown as ReturnType<typeof useContract>);

    const { result } = renderHook(() => useTipNotifications('creator_address'));

    expect(result.current).toEqual(
      expect.objectContaining({
        latestTip: null,
        unseenCount: 0,
        settings: expect.any(Object),
        updateSettings: expect.any(Function),
        markSeen: expect.any(Function),
      }),
    );
  });

  it('should not poll without creatorAddress', () => {
    const mockGetRecentTips = vi.fn();
    mockUseContract.mockReturnValue({
      getRecentTips: mockGetRecentTips,
    } as unknown as ReturnType<typeof useContract>);

    renderHook(() => useTipNotifications());

    expect(mockGetRecentTips).not.toHaveBeenCalled();
  });

  it('should initialize seen tips on first poll', async () => {
    const mockGetRecentTips = vi.fn().mockResolvedValue([mockTip]);
    mockUseContract.mockReturnValue({
      getRecentTips: mockGetRecentTips,
    } as unknown as ReturnType<typeof useContract>);

    renderHook(() => useTipNotifications('creator_address'));

    await act(async () => {
      vi.advanceTimersByTime(100);
    });

    await waitFor(() => {
      const seenTips = localStorage.getItem('tipz_seen_tip_ids:creator_address');
      expect(seenTips).toContain(String(mockTip.id));
    });
  });

  it('should detect and notify new tips', async () => {
    const newTip: Tip = { ...mockTip, id: 2 };
    const mockGetRecentTips = vi.fn();

    mockGetRecentTips.mockResolvedValueOnce([mockTip]);
    mockGetRecentTips.mockResolvedValueOnce([mockTip, newTip]);

    mockUseContract.mockReturnValue({
      getRecentTips: mockGetRecentTips,
    } as unknown as ReturnType<typeof useContract>);

    const { result } = renderHook(() => useTipNotifications('creator_address'));

    await act(async () => {
      vi.advanceTimersByTime(100);
    });

    await waitFor(() => {
      expect(localStorage.getItem('tipz_seen_tip_ids:creator_address')).toContain('1');
    });

    await act(async () => {
      vi.advanceTimersByTime(15100);
    });

    await waitFor(() => {
      expect(result.current.latestTip?.id).toBe(2);
      expect(result.current.unseenCount).toBe(1);
    });
  });

  it('should mark tips as seen', async () => {
    localStorage.setItem('tipz_unseen_tips', '5');

    const mockGetRecentTips = vi.fn().mockResolvedValue([]);
    mockUseContract.mockReturnValue({
      getRecentTips: mockGetRecentTips,
    } as unknown as ReturnType<typeof useContract>);

    const { result } = renderHook(() => useTipNotifications('creator_address'));

    expect(result.current.unseenCount).toBe(5);

    act(() => {
      result.current.markSeen();
    });

    expect(result.current.unseenCount).toBe(0);
    expect(localStorage.getItem('tipz_unseen_tips')).toBe('0');
  });

  it('should play sound when sound setting is enabled', async () => {
    const mockGetRecentTips = vi.fn();
    const newTip: Tip = { ...mockTip, id: 2 };

    mockGetRecentTips.mockResolvedValueOnce([mockTip]);
    mockGetRecentTips.mockResolvedValueOnce([mockTip, newTip]);

    mockUseContract.mockReturnValue({
      getRecentTips: mockGetRecentTips,
    } as unknown as ReturnType<typeof useContract>);

    const audioPlaySpy = vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue(undefined);

    renderHook(() => useTipNotifications('creator_address'));

    await act(async () => {
      vi.advanceTimersByTime(100);
    });

    await act(async () => {
      vi.advanceTimersByTime(15100);
    });

    await waitFor(() => {
      expect(audioPlaySpy).toHaveBeenCalled();
    });

    audioPlaySpy.mockRestore();
  });

  it('should request desktop notification permission', async () => {
    const mockGetRecentTips = vi.fn();
    const newTip: Tip = { ...mockTip, id: 2 };

    mockGetRecentTips.mockResolvedValueOnce([mockTip]);
    mockGetRecentTips.mockResolvedValueOnce([mockTip, newTip]);

    mockUseContract.mockReturnValue({
      getRecentTips: mockGetRecentTips,
    } as unknown as ReturnType<typeof useContract>);

    localStorage.setItem(
      'tipz_notification_settings',
      JSON.stringify({ sound: true, desktop: true }),
    );

    const notificationSpy = vi.spyOn(window, 'Notification', 'get').mockReturnValue({
      permission: 'default',
      requestPermission: vi.fn().mockResolvedValue('granted'),
    } as unknown as typeof Notification);

    renderHook(() => useTipNotifications('creator_address'));

    await act(async () => {
      vi.advanceTimersByTime(100);
    });

    await act(async () => {
      vi.advanceTimersByTime(15100);
    });

    notificationSpy.mockRestore();
  });

  it('should handle poll errors gracefully', async () => {
    const error = new Error('Poll failed');
    const mockGetRecentTips = vi.fn().mockRejectedValue(error);

    mockUseContract.mockReturnValue({
      getRecentTips: mockGetRecentTips,
    } as unknown as ReturnType<typeof useContract>);

    renderHook(() => useTipNotifications('creator_address'));

    await act(async () => {
      vi.advanceTimersByTime(100);
    });

    expect(mockLogger.error).toHaveBeenCalledWith(
      'hooks/useTipNotifications',
      'Failed to poll new tips',
      undefined,
      error,
    );
  });

  it('should clear interval on unmount', async () => {
    const mockGetRecentTips = vi.fn().mockResolvedValue([]);
    const clearIntervalSpy = vi.spyOn(window, 'clearInterval');

    mockUseContract.mockReturnValue({
      getRecentTips: mockGetRecentTips,
    } as unknown as ReturnType<typeof useContract>);

    const { unmount } = renderHook(() => useTipNotifications('creator_address'));

    await act(async () => {
      vi.advanceTimersByTime(100);
    });

    unmount();

    expect(clearIntervalSpy).toHaveBeenCalled();
    clearIntervalSpy.mockRestore();
  });

  it('should update notification settings', () => {
    const mockGetRecentTips = vi.fn().mockResolvedValue([]);
    mockUseContract.mockReturnValue({
      getRecentTips: mockGetRecentTips,
    } as unknown as ReturnType<typeof useContract>);

    const { result } = renderHook(() => useTipNotifications('creator_address'));

    act(() => {
      result.current.updateSettings({ sound: false });
    });

    expect(result.current.settings.sound).toBe(false);
  });
});
