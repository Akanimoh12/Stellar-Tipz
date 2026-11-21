import { describe, expect, it, vi, beforeEach } from 'vitest';
import { refreshAllXMetrics } from './xMetricsRefresh.worker.js';

const { mockFindMany, mockFetchXMetrics } = vi.hoisted(() => ({
  mockFindMany: vi.fn(),
  mockFetchXMetrics: vi.fn(),
}));

vi.mock('../db/prisma.js', () => ({
  prisma: {
    xAccount: {
      findMany: mockFindMany,
    },
    $disconnect: vi.fn(),
  },
}));

vi.mock('../modules/x/x.service.js', () => ({
  fetchXMetrics: mockFetchXMetrics,
}));

describe('refreshAllXMetrics', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns zero counts when no accounts exist', async () => {
    mockFindMany.mockResolvedValue([]);

    const result = await refreshAllXMetrics();

    expect(result).toEqual({ processed: 0, failed: 0 });
    expect(mockFindMany).toHaveBeenCalledWith({ select: { handle: true } });
    expect(mockFetchXMetrics).not.toHaveBeenCalled();
  });

  it('refreshes all known accounts', async () => {
    mockFindMany.mockResolvedValue([{ handle: 'a' }, { handle: 'b' }, { handle: 'c' }]);
    mockFetchXMetrics.mockResolvedValue(undefined);

    const result = await refreshAllXMetrics();

    expect(result).toEqual({ processed: 3, failed: 0 });
    expect(mockFetchXMetrics).toHaveBeenCalledTimes(3);
    expect(mockFetchXMetrics).toHaveBeenCalledWith('a', { useFallback: false });
    expect(mockFetchXMetrics).toHaveBeenCalledWith('b', { useFallback: false });
    expect(mockFetchXMetrics).toHaveBeenCalledWith('c', { useFallback: false });
  });

  it('continues processing when an individual refresh fails', async () => {
    mockFindMany.mockResolvedValue([{ handle: 'a' }, { handle: 'b' }, { handle: 'c' }]);
    mockFetchXMetrics
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error('rate limited'))
      .mockResolvedValueOnce(undefined);

    const result = await refreshAllXMetrics();

    expect(result).toEqual({ processed: 2, failed: 1 });
    expect(mockFetchXMetrics).toHaveBeenCalledTimes(3);
  });
});
