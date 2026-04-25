import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { subscribeToOperations, isSSESupported } from '../eventStream';

// ── minimal EventSource mock ──────────────────────────────────────────────────

type EventSourceHandlers = {
  onmessage: ((e: MessageEvent) => void) | null;
  onerror: ((e: Event) => void) | null;
};

class MockEventSource implements EventSourceHandlers {
  static instances: MockEventSource[] = [];

  url: string;
  onmessage: ((e: MessageEvent) => void) | null = null;
  onerror: ((e: Event) => void) | null = null;
  closed = false;

  constructor(url: string) {
    this.url = url;
    MockEventSource.instances.push(this);
  }

  close() {
    this.closed = true;
  }

  // Test helper — simulate an incoming SSE message.
  simulateMessage(data: unknown) {
    this.onmessage?.({
      data: JSON.stringify(data),
    } as MessageEvent);
  }

  // Test helper — simulate a connection error.
  simulateError() {
    this.onerror?.(new Event('error'));
  }
}

// ── setup / teardown ──────────────────────────────────────────────────────────

beforeEach(() => {
  MockEventSource.instances = [];
  vi.stubGlobal('EventSource', MockEventSource);
  // Suppress logger output during tests.
  vi.spyOn(console, 'debug').mockImplementation(() => undefined);
  vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  vi.spyOn(console, 'info').mockImplementation(() => undefined);
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

// ── tests ─────────────────────────────────────────────────────────────────────

describe('isSSESupported', () => {
  it('returns true when EventSource is defined', () => {
    expect(isSSESupported()).toBe(true);
  });

  it('returns false when EventSource is undefined', () => {
    vi.stubGlobal('EventSource', undefined);
    expect(isSSESupported()).toBe(false);
  });
});

describe('subscribeToOperations', () => {
  const ADDRESS = 'GTEST0000ADDRESS';

  it('creates an EventSource with the correct Horizon URL', () => {
    const stream = subscribeToOperations(ADDRESS, { onEvent: vi.fn() });
    expect(MockEventSource.instances).toHaveLength(1);
    expect(MockEventSource.instances[0].url).toContain(ADDRESS);
    expect(MockEventSource.instances[0].url).toContain('cursor=now');
    stream.close();
  });

  it('calls onEvent with parsed data when a message arrives', () => {
    const onEvent = vi.fn();
    const stream = subscribeToOperations(ADDRESS, { onEvent });

    const src = MockEventSource.instances[0];
    src.simulateMessage({ type: 'invoke_host_function', id: '123' });

    expect(onEvent).toHaveBeenCalledOnce();
    expect(onEvent).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'invoke_host_function' }),
    );
    stream.close();
  });

  it('defaults event type to "operation" for records without a type field', () => {
    const onEvent = vi.fn();
    const stream = subscribeToOperations(ADDRESS, { onEvent });

    MockEventSource.instances[0].simulateMessage({ id: '99' });

    expect(onEvent).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'operation' }),
    );
    stream.close();
  });

  it('does not call onEvent for malformed (non-JSON) SSE frames', () => {
    const onEvent = vi.fn();
    const stream = subscribeToOperations(ADDRESS, { onEvent });
    const src = MockEventSource.instances[0];

    // Bypass simulateMessage to send raw non-JSON.
    src.onmessage?.({ data: 'not-json' } as MessageEvent);

    expect(onEvent).not.toHaveBeenCalled();
    stream.close();
  });

  it('calls onError when the EventSource emits an error', () => {
    const onError = vi.fn();
    const stream = subscribeToOperations(ADDRESS, { onEvent: vi.fn(), onError });

    MockEventSource.instances[0].simulateError();

    expect(onError).toHaveBeenCalled();
    stream.close();
  });

  it('closes the EventSource when close() is called', () => {
    const stream = subscribeToOperations(ADDRESS, { onEvent: vi.fn() });
    const src = MockEventSource.instances[0];

    stream.close();

    expect(src.closed).toBe(true);
  });

  it('does not reconnect after close() is called', () => {
    vi.useFakeTimers();
    const stream = subscribeToOperations(ADDRESS, {
      onEvent: vi.fn(),
      maxBackoffMs: 100,
    });

    stream.close();
    MockEventSource.instances[0].simulateError();

    vi.advanceTimersByTime(200);
    // Only the initial EventSource should have been created.
    expect(MockEventSource.instances).toHaveLength(1);

    vi.useRealTimers();
  });

  describe('reconnection', () => {
    it('reconnects after an error with backoff', () => {
      vi.useFakeTimers();
      const onReconnect = vi.fn();
      const stream = subscribeToOperations(ADDRESS, {
        onEvent: vi.fn(),
        onReconnect,
        maxBackoffMs: 5_000,
      });

      MockEventSource.instances[0].simulateError();
      expect(MockEventSource.instances).toHaveLength(1); // not yet reconnected

      vi.advanceTimersByTime(1_100); // past MIN_BACKOFF_MS (1 000 ms)
      expect(MockEventSource.instances).toHaveLength(2); // reconnected
      expect(onReconnect).toHaveBeenCalledOnce();

      stream.close();
      vi.useRealTimers();
    });

    it('resets backoff to minimum after a successful message', () => {
      vi.useFakeTimers();
      const stream = subscribeToOperations(ADDRESS, {
        onEvent: vi.fn(),
        maxBackoffMs: 5_000,
      });

      // First error — schedules reconnect at 1 000 ms.
      MockEventSource.instances[0].simulateError();
      vi.advanceTimersByTime(1_100);

      const src2 = MockEventSource.instances[1];
      // Successful message resets backoff.
      src2.simulateMessage({ type: 'op' });
      // Second error — should schedule at MIN_BACKOFF_MS again, not 2 000 ms.
      src2.simulateError();
      vi.advanceTimersByTime(1_100);

      // Third instance should exist (backoff reset, not doubled).
      expect(MockEventSource.instances).toHaveLength(3);

      stream.close();
      vi.useRealTimers();
    });
  });

  describe('page visibility', () => {
    it('pauses the stream when the page is hidden', () => {
      const stream = subscribeToOperations(ADDRESS, { onEvent: vi.fn() });
      const src = MockEventSource.instances[0];

      // Simulate tab hidden.
      Object.defineProperty(document, 'hidden', { value: true, configurable: true });
      document.dispatchEvent(new Event('visibilitychange'));

      expect(src.closed).toBe(true);

      stream.close();
      Object.defineProperty(document, 'hidden', { value: false, configurable: true });
    });

    it('resumes the stream when the page becomes visible', () => {
      const stream = subscribeToOperations(ADDRESS, { onEvent: vi.fn() });

      // Hide then show the page.
      Object.defineProperty(document, 'hidden', { value: true, configurable: true });
      document.dispatchEvent(new Event('visibilitychange'));

      Object.defineProperty(document, 'hidden', { value: false, configurable: true });
      document.dispatchEvent(new Event('visibilitychange'));

      // A new EventSource should have been opened on resume.
      expect(MockEventSource.instances.length).toBeGreaterThanOrEqual(2);

      stream.close();
    });
  });
});
