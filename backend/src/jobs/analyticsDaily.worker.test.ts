import { describe, expect, it, vi, beforeEach } from 'vitest';
import { runDailyAnalyticsRollup } from './analyticsDaily.worker.js';

const { mockComputeDailyAnalytics } = vi.hoisted(() => ({
  mockComputeDailyAnalytics: vi.fn(),
}));

vi.mock('../modules/analytics/analytics.service.js', () => ({
  computeDailyAnalytics: mockComputeDailyAnalytics,
}));

describe('runDailyAnalyticsRollup', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('computes analytics for yesterday', async () => {
    const yesterday = new Date();
    yesterday.setUTCDate(yesterday.getUTCDate() - 1);
    const expectedDate = yesterday.toISOString().slice(0, 10);

    mockComputeDailyAnalytics.mockResolvedValue({
      date: expectedDate,
      totalTips: 10,
      totalVolume: '500000000',
      newUsers: 3,
      activeUsers: 7,
    });

    const result = await runDailyAnalyticsRollup();

    expect(result).toEqual({
      date: expectedDate,
      totalTips: 10,
      totalVolume: '500000000',
    });
    expect(mockComputeDailyAnalytics).toHaveBeenCalledWith(expectedDate);
  });

  it('handles empty days', async () => {
    const yesterday = new Date();
    yesterday.setUTCDate(yesterday.getUTCDate() - 1);
    const expectedDate = yesterday.toISOString().slice(0, 10);

    mockComputeDailyAnalytics.mockResolvedValue({
      date: expectedDate,
      totalTips: 0,
      totalVolume: '0',
      newUsers: 0,
      activeUsers: 0,
    });

    const result = await runDailyAnalyticsRollup();

    expect(result.date).toBe(expectedDate);
    expect(result.totalTips).toBe(0);
    expect(result.totalVolume).toBe('0');
  });
});
