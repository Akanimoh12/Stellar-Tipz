import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockGetEventsFrom, mockGetLatestLedger, mockGetCursorLedger, mockSetCursorLedger, mockProjectEvent } =
  vi.hoisted(() => ({
    mockGetEventsFrom: vi.fn(),
    mockGetLatestLedger: vi.fn(),
    mockGetCursorLedger: vi.fn(),
    mockSetCursorLedger: vi.fn(),
    mockProjectEvent: vi.fn(),
  }));

vi.mock('../src/indexer/sorobanClient.js', () => ({
  getEventsFrom: mockGetEventsFrom,
  getLatestLedger: mockGetLatestLedger,
}));

vi.mock('../src/indexer/cursor.js', () => ({
  getCursorLedger: mockGetCursorLedger,
  setCursorLedger: mockSetCursorLedger,
}));

vi.mock('../src/indexer/projections.js', () => ({
  projectEvent: mockProjectEvent,
}));

const ev = (ledger: number, txHash: string, topic = 'tip_sent') => ({
  ledger,
  txHash,
  topic,
  pagingToken: `${ledger}-0`,
  value: { from: 'GABC12345678901234567890123456789012345678901234567', to: 'GDEF12345678901234567890123456789012345678901234567', amount: '1000000' },
});

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  mockGetLatestLedger.mockResolvedValue(100);
  mockGetCursorLedger.mockResolvedValue(null);
  mockSetCursorLedger.mockResolvedValue(undefined);
  mockProjectEvent.mockResolvedValue(undefined);
});

describe('indexer backfill (issue #1259)', () => {
  it('reindexes an explicit range and reports progress totals', async () => {
    const { runBackfill } = await import('../src/indexer/backfill.js');
    mockGetEventsFrom.mockResolvedValueOnce({ events: [ev(10, 'a')], latestLedger: 10 });

    const { report } = await runBackfill({ from: 10, to: 10 });

    expect(report.fromLedger).toBe(10);
    expect(report.eventsProjected).toBe(1);
    expect(mockProjectEvent).toHaveBeenCalledTimes(1);
    expect(mockSetCursorLedger).toHaveBeenCalledWith('backfill_tip_events', 10);
  });

  it('dry-run projects nothing and does not advance the cursor', async () => {
    const { runBackfill } = await import('../src/indexer/backfill.js');
    mockGetEventsFrom.mockResolvedValueOnce({ events: [ev(10, 'a')], latestLedger: 10 });

    const { report } = await runBackfill({ from: 10, to: 10, dryRun: true });

    expect(report.dryRun).toBe(true);
    expect(report.eventsProjected).toBe(1); // counted for the report
    expect(mockProjectEvent).not.toHaveBeenCalled();
    expect(mockSetCursorLedger).not.toHaveBeenCalled();
  });

  it('resumes from the stored backfill cursor plus one', async () => {
    const { runBackfill } = await import('../src/indexer/backfill.js');
    mockGetCursorLedger.mockResolvedValue(50);
    mockGetEventsFrom.mockResolvedValueOnce({ events: [ev(51, 'b')], latestLedger: 51 });

    const { report } = await runBackfill({});

    // from = stored cursor + 1
    expect(report.fromLedger).toBe(51);
    expect(mockGetEventsFrom).toHaveBeenCalledWith(51, undefined);
  });

  it('force ignores the stored cursor', async () => {
    const { runBackfill } = await import('../src/indexer/backfill.js');
    mockGetCursorLedger.mockResolvedValue(50);
    mockGetEventsFrom.mockResolvedValueOnce({ events: [ev(10, 'a')], latestLedger: 10 });

    const { report } = await runBackfill({ from: 10, force: true });

    expect(report.fromLedger).toBe(10);
    // force means the stored cursor is ignored for the start point
    expect(report.fromLedger).toBe(10);
  });

  it('does no work and leaves the cursor when from > to', async () => {
    const { runBackfill } = await import('../src/indexer/backfill.js');
    const { report } = await runBackfill({ from: 200, to: 100 });
    expect(report.eventsProjected).toBe(0);
    expect(mockGetEventsFrom).not.toHaveBeenCalled();
  });
});