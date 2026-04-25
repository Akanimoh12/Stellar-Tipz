import { renderHook, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { useRealTimeNotifications } from '../useRealTimeNotifications';
import { useTipNotifications } from '../useTipNotifications';

// ── mocks ─────────────────────────────────────────────────────────────────────

vi.mock('../useTipNotifications');

const mockBase = {
  latestTip: null,
  unseenCount: 0,
  settings: { sound: true, desktop: false },
  markSeen: vi.fn(),
  updateSettings: vi.fn(),
};
const mockUseTipNotifications = vi.mocked(useTipNotifications);

// Minimal EventSource mock.
class MockEventSource {
  static instances: MockEventSource[] = [];
  onmessage: ((e: MessageEvent) => void) | null = null;
  onerror: ((e: Event) => void) | null = null;
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

// ── setup / teardown ──────────────────────────────────────────────────────────

beforeEach(() => {
  MockEventSource.instances = [];
  mockUseTipNotifications.mockReturnValue(mockBase as ReturnType<typeof useTipNotifications>);
  vi.stubGlobal('EventSource', MockEventSource);
  vi.spyOn(console, 'debug').mockImplementation(() => undefined);
  vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  vi.spyOn(console, 'info').mockImplementation(() => undefined);
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

// ── tests ─────────────────────────────────────────────────────────────────────

describe('useRealTimeNotifications', () => {
  it('spreads all values from useTipNotifications', () => {
    const { result } = renderHook(() =>
      useRealTimeNotifications('GCREATOR0000'),
    );
    expect(result.current.latestTip).toBeNull();
    expect(result.current.unseenCount).toBe(0);
    expect(typeof result.current.markSeen).toBe('function');
  });

  it('exposes isConnected, reconnectCount, and isSSESupported', () => {
    const { result } = renderHook(() =>
      useRealTimeNotifications('GCREATOR0000'),
    );
    expect(typeof result.current.isConnected).toBe('boolean');
    expect(typeof result.current.reconnectCount).toBe('number');
    expect(typeof result.current.isSSESupported).toBe('boolean');
  });

  it('opens an SSE connection when creatorAddress is provided', () => {
    renderHook(() => useRealTimeNotifications('GCREATOR0000'));
    expect(MockEventSource.instances).toHaveLength(1);
    expect(MockEventSource.instances[0].url).toContain('GCREATOR0000');
  });

  it('does not open an SSE connection when creatorAddress is undefined', () => {
    renderHook(() => useRealTimeNotifications(undefined));
    expect(MockEventSource.instances).toHaveLength(0);
  });

  it('sets isConnected to true after mounting with a valid address', () => {
    const { result } = renderHook(() =>
      useRealTimeNotifications('GCREATOR0000'),
    );
    expect(result.current.isConnected).toBe(true);
  });

  it('reports isSSESupported as true when EventSource is available', () => {
    const { result } = renderHook(() =>
      useRealTimeNotifications('GCREATOR0000'),
    );
    expect(result.current.isSSESupported).toBe(true);
  });

  it('reports isSSESupported as false when EventSource is unavailable', () => {
    vi.stubGlobal('EventSource', undefined);
    const { result } = renderHook(() =>
      useRealTimeNotifications('GCREATOR0000'),
    );
    expect(result.current.isSSESupported).toBe(false);
    expect(MockEventSource.instances).toHaveLength(0);
  });

  it('increments reconnectCount when an SSE event arrives', () => {
    const { result } = renderHook(() =>
      useRealTimeNotifications('GCREATOR0000'),
    );
    const before = result.current.reconnectCount;

    act(() => {
      MockEventSource.instances[0].simulateMessage({ type: 'invoke_host_function' });
    });

    expect(result.current.reconnectCount).toBe(before + 1);
  });

  it('sets isConnected to false on SSE error', () => {
    const { result } = renderHook(() =>
      useRealTimeNotifications('GCREATOR0000'),
    );
    expect(result.current.isConnected).toBe(true);

    act(() => {
      MockEventSource.instances[0].simulateError();
    });

    expect(result.current.isConnected).toBe(false);
  });

  it('closes the SSE stream on unmount', () => {
    const { unmount } = renderHook(() =>
      useRealTimeNotifications('GCREATOR0000'),
    );
    const src = MockEventSource.instances[0];
    unmount();
    expect(src.closed).toBe(true);
  });

  it('reconnects when creatorAddress changes', () => {
    const { rerender } = renderHook(
      ({ addr }: { addr: string }) => useRealTimeNotifications(addr),
      { initialProps: { addr: 'GCREATOR_A' } },
    );
    expect(MockEventSource.instances).toHaveLength(1);

    rerender({ addr: 'GCREATOR_B' });
    // Old stream closed, new one opened.
    expect(MockEventSource.instances[0].closed).toBe(true);
    expect(MockEventSource.instances).toHaveLength(2);
    expect(MockEventSource.instances[1].url).toContain('GCREATOR_B');
  });
});
