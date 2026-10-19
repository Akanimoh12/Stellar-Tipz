import { describe, expect, it, vi, beforeEach } from 'vitest';
import {
  TIPPER_ROLLUP_JOB,
  createAnalyticsDailyWorker,
  runDailyAnalyticsRollup,
  scheduleAnalyticsDaily,
} from './analyticsDaily.worker.js';

const { mockComputeDailyAnalytics, mockRefreshTipperRollup, mockScheduleRepeatable, processors } = vi.hoisted(() => ({
  mockComputeDailyAnalytics: vi.fn(),
  mockRefreshTipperRollup: vi.fn(),
  mockScheduleRepeatable: vi.fn(),
  processors: [] as Array<(job: { name: string; data?: unknown }) => Promise<void>>,
}));

vi.mock('../modules/analytics/analytics.service.js', () => ({
  computeDailyAnalytics: mockComputeDailyAnalytics,
  refreshTipperRollup: mockRefreshTipperRollup,
}));
vi.mock('bullmq', () => ({
  Worker: class {
    constructor(_queue: string, processor: (job: { name: string; data?: unknown }) => Promise<void>) {
      processors.push(processor);
    }
    on() {
      return this;
    }
  },
}));
vi.mock('./scheduler.js', () => ({ scheduleRepeatable: mockScheduleRepeatable }));
vi.mock('./deadLetter.js', () => ({ attachDeadLetterHandler: vi.fn() }));
vi.mock('./analyticsDaily.queue.js', () => ({
  ANALYTICS_DAILY_QUEUE: 'analytics-daily',
  getAnalyticsDailyQueue: () => ({ name: 'analytics-daily' }),
}));
vi.mock('../db/redis.js', () => ({ redis: { on: vi.fn() } }));

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

describe('analytics worker jobs (issue #1265)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    processors.length = 0;
  });

  it('rebuilds the top-tippers rollup for the tipper-rollup job', async () => {
    createAnalyticsDailyWorker();
    await processors[0]({ name: TIPPER_ROLLUP_JOB });

    expect(mockRefreshTipperRollup).toHaveBeenCalledOnce();
    expect(mockComputeDailyAnalytics).not.toHaveBeenCalled();
  });

  it('still runs the daily rollup for the rollup job', async () => {
    mockComputeDailyAnalytics.mockResolvedValue({ date: '2026-07-01', totalTips: 1, totalVolume: '1' });
    createAnalyticsDailyWorker();
    await processors[0]({ name: 'rollup', data: { date: '2026-07-01' } });

    expect(mockComputeDailyAnalytics).toHaveBeenCalledWith('2026-07-01');
    expect(mockRefreshTipperRollup).not.toHaveBeenCalled();
  });

  it('schedules both repeatable jobs', async () => {
    await scheduleAnalyticsDaily();

    expect(mockScheduleRepeatable.mock.calls.map(([options]) => [options.name, options.pattern])).toEqual([
      ['rollup', '5 0 * * *'],
      [TIPPER_ROLLUP_JOB, '*/10 * * * *'],
    ]);
  });
});
