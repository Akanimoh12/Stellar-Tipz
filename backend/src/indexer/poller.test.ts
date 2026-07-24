import { describe, expect, it, vi, beforeEach } from 'vitest';
import { fixtureEventPage, tipSentEvent } from './fixtures/events.js';

const {
  mockGetEventsFrom,
  mockGetLatestLedger,
  mockGetCursorLedger,
  mockSetCursorLedger,
  mockProjectEvent,
} = vi.hoisted(() => ({
  mockGetEventsFrom: vi.fn(),
  mockGetLatestLedger: vi.fn(),
  mockGetCursorLedger: vi.fn(),
  mockSetCursorLedger: vi.fn(),
  mockProjectEvent: vi.fn(),
}));

vi.mock('./sorobanClient.js', () => ({
  getEventsFrom: mockGetEventsFrom,
  getLatestLedger: mockGetLatestLedger,
}));

vi.mock('./cursor.js', () => ({
  getCursorLedger: mockGetCursorLedger,
  setCursorLedger: mockSetCursorLedger,
}));

vi.mock('./projections.js', () => ({
  projectEvent: mockProjectEvent,
}));

beforeEach(() => {
  vi.clearAllMocks();
  mockGetCursorLedger.mockResolvedValue(null);
  mockGetLatestLedger.mockResolvedValue(101);
  mockSetCursorLedger.mockResolvedValue(undefined);
  mockProjectEvent.mockResolvedValue(undefined);
});

describe('pollOnce', () => {
  it('projects fixture events and advances the cursor', async () => {
    mockGetEventsFrom.mockResolvedValue(fixtureEventPage);

    const { pollOnce } = await import('./poller.js');
    await pollOnce();

    expect(mockProjectEvent).toHaveBeenCalledTimes(fixtureEventPage.events.length);
    expect(mockProjectEvent).toHaveBeenCalledWith(tipSentEvent);
    expect(mockSetCursorLedger).toHaveBeenCalledWith('tip_events', 101);
  });

  it('does not advance the cursor when projection fails', async () => {
    mockGetEventsFrom.mockResolvedValue({ events: [tipSentEvent], latestLedger: 100 });
    mockProjectEvent.mockRejectedValue(new Error('projection failed'));

    const { pollOnce } = await import('./poller.js');
    await expect(pollOnce()).rejects.toThrow('cursor not advanced');
    expect(mockSetCursorLedger).not.toHaveBeenCalled();
  });

  it('re-running over the same ledgers replays projections idempotently', async () => {
    mockGetCursorLedger.mockResolvedValue(99);
    mockGetEventsFrom.mockResolvedValue({ events: [tipSentEvent], latestLedger: 100 });

    const { pollOnce } = await import('./poller.js');
    await pollOnce();
    await pollOnce();

    expect(mockProjectEvent).toHaveBeenCalledTimes(2);
    expect(mockSetCursorLedger).toHaveBeenCalledTimes(2);
    expect(mockSetCursorLedger).toHaveBeenNthCalledWith(1, 'tip_events', 100);
    expect(mockSetCursorLedger).toHaveBeenNthCalledWith(2, 'tip_events', 100);
  });

  it('resumes from stored cursor plus one', async () => {
    mockGetCursorLedger.mockResolvedValue(50);
    mockGetEventsFrom.mockResolvedValue({ events: [], latestLedger: 55 });

    const { pollOnce } = await import('./poller.js');
    await pollOnce();

    expect(mockGetEventsFrom).toHaveBeenCalledWith(51, undefined);
    expect(mockSetCursorLedger).toHaveBeenCalledWith('tip_events', 55);
  });
});

describe('startIndexer', () => {
  it('returns a handle that stops further polling', async () => {
    vi.useFakeTimers();
    mockGetEventsFrom.mockResolvedValue({ events: [], latestLedger: 1 });

    const { startIndexer } = await import('./poller.js');
    const handle = startIndexer();

    await vi.runOnlyPendingTimersAsync();
    expect(mockGetEventsFrom).toHaveBeenCalled();

    handle.stop();
    mockGetEventsFrom.mockClear();
    await vi.advanceTimersByTimeAsync(10_000);
    expect(mockGetEventsFrom).not.toHaveBeenCalled();

    vi.useRealTimers();
  });
});
