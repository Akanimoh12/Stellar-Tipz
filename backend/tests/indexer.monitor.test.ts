import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockGetLatestLedger, mockGetCursorLedger } = vi.hoisted(() => ({
  mockGetLatestLedger: vi.fn(),
  mockGetCursorLedger: vi.fn(),
}));

vi.mock('../src/indexer/sorobanClient.js', () => ({
  getLatestLedger: mockGetLatestLedger,
}));

vi.mock('../src/indexer/cursor.js', () => ({
  getCursorLedger: mockGetCursorLedger,
  setCursorLedger: vi.fn(),
}));

describe('indexer monitor (issue #1258)', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    mockGetLatestLedger.mockResolvedValue(500);
    mockGetCursorLedger.mockResolvedValue(null);
  });

  const load = async () => import('../src/indexer/monitor.js');

  it('computes lag as chain head minus last processed ledger', async () => {
    const { getIndexerReport, noteProcessedLedger } = await load();
    mockGetLatestLedger.mockResolvedValue(500);
    noteProcessedLedger(480);
    const report = await getIndexerReport();
    expect(report.lagLedgers).toBe(20);
    expect(report.lastProcessedLedger).toBe(480);
    expect(report.healthy).toBe(true);
  });

  it('reports zero lag when caught up to the chain head', async () => {
    const { getIndexerReport, noteProcessedLedger } = await load();
    mockGetLatestLedger.mockResolvedValue(500);
    noteProcessedLedger(500);
    const report = await getIndexerReport();
    expect(report.lagLedgers).toBe(0);
    expect(report.healthy).toBe(true);
  });

  it('is unhealthy past the lag threshold and reconciles with the persisted cursor', async () => {
    const { getIndexerReport, resetIndexerMonitor } = await load();
    resetIndexerMonitor();
    mockGetLatestLedger.mockResolvedValue(5000);
    mockGetCursorLedger.mockResolvedValue(100); // persisted cursor, never advanced
    const report = await getIndexerReport();
    expect(report.lagLedgers).toBe(4900);
    expect(report.healthy).toBe(false);
  });

  it('recovers to healthy after the cursor catches up', async () => {
    const { getIndexerReport, noteProcessedLedger } = await load();
    mockGetLatestLedger.mockResolvedValue(500);
    // Lag above the default threshold (50) is unhealthy.
    noteProcessedLedger(1);
    expect((await getIndexerReport()).healthy).toBe(false);
    // Catching up to the head restores health.
    noteProcessedLedger(499);
    expect((await getIndexerReport()).healthy).toBe(true);
  });

  it('exposes processing and error totals', async () => {
    const { recordIndexerTick, noteIndexerError, getIndexerReport, noteProcessedLedger } = await load();
    mockGetLatestLedger.mockResolvedValue(500);
    noteProcessedLedger(480);
    recordIndexerTick(5);
    noteProcessedLedger(490);
    recordIndexerTick(3);
    noteIndexerError();
    const report = await getIndexerReport();
    expect(report.eventsProcessedTotal).toBe(8);
    expect(report.errorsTotal).toBe(1);
  });
});