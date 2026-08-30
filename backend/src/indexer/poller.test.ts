import { describe, expect, it, vi, beforeEach } from 'vitest';
import { fixtureEventPage, tipSentEvent, profileRegisterEvent } from './fixtures/events.js';

const {
  mockGetEventsFrom,
  mockGetLatestLedger,
  mockGetLedgerHash,
  mockGetCursorLedger,
  mockSetCursorLedger,
  mockProjectEvent,
  mockCheckAndHandleReorg,
  mockRecordCheckpoint,
} = vi.hoisted(() => ({
  mockGetEventsFrom: vi.fn(),
  mockGetLatestLedger: vi.fn(),
  mockGetLedgerHash: vi.fn(),
  mockGetCursorLedger: vi.fn(),
  mockSetCursorLedger: vi.fn(),
  mockProjectEvent: vi.fn(),
  mockCheckAndHandleReorg: vi.fn(),
  mockRecordCheckpoint: vi.fn(),
}));

vi.mock('./sorobanClient.js', () => ({
  getEventsFrom: mockGetEventsFrom,
  getLatestLedger: mockGetLatestLedger,
  getLedgerHash: mockGetLedgerHash,
}));

vi.mock('./cursor.js', () => ({
  getCursorLedger: mockGetCursorLedger,
  setCursorLedger: mockSetCursorLedger,
}));

vi.mock('./projections.js', () => ({ projectEvent: mockProjectEvent }));
vi.mock('./reorg.js', () => ({ checkAndHandleReorg: mockCheckAndHandleReorg }));
vi.mock('./ledger-checkpoint.store.js', () => ({ recordCheckpoint: mockRecordCheckpoint }));

// Default finality depth is 10; a head far above the fixture ledgers (100–110)
// means every fixture event is finalized.
const HEAD = 200;
const CEILING = HEAD - 10;

beforeEach(() => {
  vi.clearAllMocks();
  mockGetCursorLedger.mockResolvedValue(99); // startLedger = 100
  mockGetLatestLedger.mockResolvedValue(HEAD);
  mockGetLedgerHash.mockResolvedValue('ledger-hash');
  mockSetCursorLedger.mockResolvedValue(undefined);
  mockProjectEvent.mockResolvedValue(undefined);
  mockCheckAndHandleReorg.mockResolvedValue(false);
  mockRecordCheckpoint.mockResolvedValue(undefined);
});

describe('pollOnce', () => {
  it('projects finalized fixture events and advances the cursor to the finality ceiling', async () => {
    mockGetEventsFrom.mockResolvedValue(fixtureEventPage);

    const { pollOnce } = await import('./poller.js');
    await pollOnce();

    expect(mockProjectEvent).toHaveBeenCalledWith(tipSentEvent);
    expect(mockProjectEvent).toHaveBeenCalledWith(profileRegisterEvent);
    expect(mockSetCursorLedger).toHaveBeenCalledWith('tip_events', CEILING);
    expect(mockRecordCheckpoint).toHaveBeenCalledWith('tip_events', CEILING, 'ledger-hash');
  });

  it('checks for a reorg first and skips the tick when one was handled', async () => {
    mockCheckAndHandleReorg.mockResolvedValue(true);
    mockGetEventsFrom.mockResolvedValue(fixtureEventPage);

    const { pollOnce } = await import('./poller.js');
    await pollOnce();

    expect(mockGetEventsFrom).not.toHaveBeenCalled();
    expect(mockSetCursorLedger).not.toHaveBeenCalled();
  });

  it('does NOT project an event past the finality ceiling — leaves it for a later tick', async () => {
    const unfinalized = { ...tipSentEvent, ledger: HEAD - 2, txHash: 'unfinalized-tx' };
    mockGetEventsFrom.mockResolvedValue({ events: [unfinalized], latestLedger: HEAD });

    const { pollOnce } = await import('./poller.js');
    await pollOnce();

    expect(mockProjectEvent).not.toHaveBeenCalled();
    // Cursor still advances to the ceiling (finalized ledgers with no events).
    expect(mockSetCursorLedger).toHaveBeenCalledWith('tip_events', CEILING);
  });

  it('does nothing when nothing has finalized past the cursor yet', async () => {
    mockGetCursorLedger.mockResolvedValue(HEAD); // startLedger = HEAD+1 > ceiling
    mockGetEventsFrom.mockResolvedValue({ events: [], latestLedger: HEAD });

    const { pollOnce } = await import('./poller.js');
    await pollOnce();

    expect(mockGetEventsFrom).not.toHaveBeenCalled();
    expect(mockSetCursorLedger).not.toHaveBeenCalled();
  });

  it('does not advance the cursor when projection fails', async () => {
    mockGetEventsFrom.mockResolvedValue({ events: [tipSentEvent], latestLedger: HEAD });
    mockProjectEvent.mockRejectedValue(new Error('projection failed'));

    const { pollOnce } = await import('./poller.js');
    await expect(pollOnce()).rejects.toThrow('cursor not advanced');
    expect(mockSetCursorLedger).not.toHaveBeenCalled();
  });

  it('resumes from stored cursor plus one', async () => {
    mockGetCursorLedger.mockResolvedValue(50);
    mockGetEventsFrom.mockResolvedValue({ events: [], latestLedger: HEAD });

    const { pollOnce } = await import('./poller.js');
    await pollOnce();

    expect(mockGetEventsFrom).toHaveBeenCalledWith(51, undefined);
    expect(mockSetCursorLedger).toHaveBeenCalledWith('tip_events', CEILING);
  });

  it('re-running over the same finalized ledgers replays projections idempotently', async () => {
    mockGetCursorLedger.mockResolvedValue(99);
    mockGetEventsFrom.mockResolvedValue({ events: [tipSentEvent], latestLedger: HEAD });

    const { pollOnce } = await import('./poller.js');
    await pollOnce();
    await pollOnce();

    expect(mockProjectEvent).toHaveBeenCalledTimes(2);
    expect(mockSetCursorLedger).toHaveBeenNthCalledWith(1, 'tip_events', CEILING);
    expect(mockSetCursorLedger).toHaveBeenNthCalledWith(2, 'tip_events', CEILING);
  });
});

describe('startIndexer', () => {
  it('returns a handle that stops further polling', async () => {
    vi.useFakeTimers();
    mockGetEventsFrom.mockResolvedValue({ events: [], latestLedger: HEAD });

    const { startIndexer } = await import('./poller.js');
    const handle = startIndexer();

    await vi.runOnlyPendingTimersAsync();
    expect(mockGetLatestLedger).toHaveBeenCalled();

    handle.stop();
    mockGetLatestLedger.mockClear();
    await vi.advanceTimersByTimeAsync(10_000);
    expect(mockGetLatestLedger).not.toHaveBeenCalled();

    vi.useRealTimers();
  });

  it('waits for an active poll before stopping', async () => {
    vi.useFakeTimers();
    let resolveEvents!: (value: { events: never[]; latestLedger: number }) => void;
    mockGetEventsFrom.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveEvents = resolve;
      }),
    );

    const { startIndexer } = await import('./poller.js');
    const handle = startIndexer();
    await vi.runOnlyPendingTimersAsync();

    let stopped = false;
    const stopping = handle.stop().then(() => {
      stopped = true;
    });
    await Promise.resolve();
    expect(stopped).toBe(false);

    resolveEvents({ events: [], latestLedger: HEAD });
    await stopping;
    expect(stopped).toBe(true);
    vi.useRealTimers();
  });
});
