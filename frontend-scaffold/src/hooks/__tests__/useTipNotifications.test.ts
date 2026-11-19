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

// ── SSE (merged from the former useRealTimeNotifications hook) ────────────────

/** Minimal EventSource stand-in used by the real `eventStream` service. */
class MockEventSource {
  static instances: MockEventSource[] = [];
  onmessage: ((e: MessageEvent) => void) | null = null;
  onerror: ((e: Event) => void) | null = null;
  onopen: (() => void) | null = null;
  closed = false;

  constructor(public url: string) {
    MockEventSource.instances.push(this);
  }
  close() {
    this.closed = true;
  }
  simulateError() {
    this.onerror?.(new Event('error'));
  }
  simulateMessage(data: unknown) {
    this.onmessage?.({ data: JSON.stringify(data) } as MessageEvent);
  }
}

describe('useTipNotifications (SSE)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    MockEventSource.instances = [];
    vi.stubGlobal('EventSource', MockEventSource);
    mockUseContract.mockReturnValue({
      getRecentTips: vi.fn().mockResolvedValue([]),
    } as unknown as ReturnType<typeof useContract>);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('exposes connectionState, reconnectCount, isSSESupported and reconnect', () => {
    const { result } = renderHook(() => useTipNotifications('GCREATOR0000'));

    expect(typeof result.current.connectionState).toBe('string');
    expect(typeof result.current.reconnectCount).toBe('number');
    expect(typeof result.current.isSSESupported).toBe('boolean');
    expect(typeof result.current.reconnect).toBe('function');
    expect(typeof result.current.isConnected).toBe('boolean');
  });

  it('opens an SSE connection when creatorAddress is provided', () => {
    renderHook(() => useTipNotifications('GCREATOR0000'));

    expect(MockEventSource.instances).toHaveLength(1);
    expect(MockEventSource.instances[0].url).toContain('GCREATOR0000');
  });

  it('does not open an SSE connection when creatorAddress is undefined', () => {
    renderHook(() => useTipNotifications());

    expect(MockEventSource.instances).toHaveLength(0);
  });

  it('transitions connectionState to connected after mounting', async () => {
    const { result } = renderHook(() => useTipNotifications('GCREATOR0000'));

    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });

    expect(result.current.connectionState).toBe('connected');
    expect(result.current.isConnected).toBe(true);
  });

  it('reports isSSESupported as false when EventSource is unavailable', () => {
    vi.stubGlobal('EventSource', undefined);

    const { result } = renderHook(() => useTipNotifications('GCREATOR0000'));

    expect(result.current.isSSESupported).toBe(false);
    expect(MockEventSource.instances).toHaveLength(0);
  });

  it('increments reconnectCount when an SSE event arrives', () => {
    const { result } = renderHook(() => useTipNotifications('GCREATOR0000'));
    const before = result.current.reconnectCount;

    act(() => {
      MockEventSource.instances[0].simulateMessage({
        type: 'invoke_host_function',
      });
    });

    expect(result.current.reconnectCount).toBe(before + 1);
  });

  it('sets connectionState to disconnected on SSE error', async () => {
    const { result } = renderHook(() => useTipNotifications('GCREATOR0000'));

    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });
    expect(result.current.connectionState).toBe('connected');

    act(() => {
      MockEventSource.instances[0].simulateError();
    });

    expect(result.current.connectionState).toBe('disconnected');
  });

  it('closes the SSE stream on unmount', () => {
    const { unmount } = renderHook(() => useTipNotifications('GCREATOR0000'));
    const src = MockEventSource.instances[0];

    unmount();

    expect(src.closed).toBe(true);
  });

  it('reconnects when creatorAddress changes', () => {
    const { rerender } = renderHook(
      ({ addr }: { addr: string }) => useTipNotifications(addr),
      { initialProps: { addr: 'GCREATOR_A' } },
    );
    expect(MockEventSource.instances).toHaveLength(1);

    rerender({ addr: 'GCREATOR_B' });

    expect(MockEventSource.instances[0].closed).toBe(true);
    expect(MockEventSource.instances).toHaveLength(2);
    expect(MockEventSource.instances[1].url).toContain('GCREATOR_B');
  });
});
