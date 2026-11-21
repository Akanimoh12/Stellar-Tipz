import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  mockTipCount,
  mockTipAggregate,
  mockUserCount,
  mockCacheSetJSON,
  mockScheduleRepeatable,
  mockAttachDeadLetterHandler,
  mockLoggerInfo,
  mockLoggerError,
  processors,
  failedHandlers,
} = vi.hoisted(() => ({
  mockTipCount: vi.fn(),
  mockTipAggregate: vi.fn(),
  mockUserCount: vi.fn(),
  mockCacheSetJSON: vi.fn(),
  mockScheduleRepeatable: vi.fn(),
  mockAttachDeadLetterHandler: vi.fn(),
  mockLoggerInfo: vi.fn(),
  mockLoggerError: vi.fn(),
  processors: [] as Array<(job: unknown) => Promise<void>>,
  failedHandlers: [] as Array<(job: { id?: string } | undefined, err: Error) => void>,
}));

vi.mock('../db/prisma.js', () => ({
  prisma: {
    tip: {
      count: mockTipCount,
      aggregate: mockTipAggregate,
    },
    user: {
      count: mockUserCount,
    },
  },
}));

vi.mock('../common/utils/cache.js', () => ({
  cacheSetJSON: mockCacheSetJSON,
  cacheGetJSON: vi.fn(),
}));

vi.mock('../common/utils/logger.js', () => ({
  logger: {
    info: mockLoggerInfo,
    error: mockLoggerError,
    warn: vi.fn(),
    debug: vi.fn(),
  },
}));

vi.mock('bullmq', () => ({
  Worker: class {
    constructor(_queue: string, processor: (job: unknown) => Promise<void>) {
      processors.push(processor);
    }
    on(event: string, handler: (job: { id?: string } | undefined, err: Error) => void) {
      if (event === 'failed') {
        failedHandlers.push(handler);
      }
      return this;
    }
  },
}));

vi.mock('../db/redis.js', () => ({
  bullConnection: {},
  redis: { on: vi.fn() },
}));

vi.mock('./platformStats.queue.js', () => ({
  PLATFORM_STATS_QUEUE: 'platform-stats',
  getPlatformStatsQueue: () => ({ name: 'platform-stats' }),
}));

vi.mock('./scheduler.js', () => ({
  scheduleRepeatable: mockScheduleRepeatable,
}));

vi.mock('./deadLetter.js', () => ({
  attachDeadLetterHandler: mockAttachDeadLetterHandler,
}));

import {
  createPlatformStatsWorker,
  refreshPlatformStats,
  schedulePlatformStats,
} from './platformStats.worker.js';
import { config } from '../config/index.js';

describe('platformStats.worker (issue #1634)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    processors.length = 0;
    failedHandlers.length = 0;
    mockCacheSetJSON.mockResolvedValue(undefined);
  });

  describe('refreshPlatformStats — aggregation correctness', () => {
    it('aggregates total tips, total volume, active creator count, and 24h activity and caches them', async () => {
      mockTipCount.mockResolvedValueOnce(150).mockResolvedValueOnce(25);
      mockTipAggregate
        .mockResolvedValueOnce({ _sum: { amountStroops: BigInt(980_000_000) } })
        .mockResolvedValueOnce({ _sum: { amountStroops: BigInt(120_000_000) } });
      mockUserCount.mockResolvedValueOnce(48);

      await refreshPlatformStats();

      expect(mockTipCount).toHaveBeenNthCalledWith(1, {
        where: { status: 'CONFIRMED' },
      });
      expect(mockTipCount).toHaveBeenNthCalledWith(2, {
        where: {
          status: 'CONFIRMED',
          createdAt: { gte: expect.any(Date) },
        },
      });
      expect(mockUserCount).toHaveBeenCalledWith({
        where: {
          deletedAt: null,
          deactivatedAt: null,
          blockedAt: null,
          flaggedUnverified: false,
          receivedTips: { some: { status: 'CONFIRMED' } },
        },
      });

      expect(mockCacheSetJSON).toHaveBeenCalledTimes(1);
      const [cacheKey, payload, ttl] = mockCacheSetJSON.mock.calls[0];
      expect(cacheKey).toBe('stats:platform');
      expect(ttl).toBe(config.platformStats.cacheTtlSeconds);
      expect(payload).toMatchObject({
        totalTips: 150,
        totalVolumeStroops: '980000000',
        creatorCount: 48,
        activity24h: {
          tips: 25,
          volumeStroops: '120000000',
        },
        stale: false,
      });
      expect(typeof payload.generatedAt).toBe('string');
      expect(mockLoggerInfo).toHaveBeenCalledWith(
        { totalTips: 150, creatorCount: 48 },
        'Platform stats refreshed',
      );
    });

    it('handles an empty database by defaulting null sum aggregates to zero strings', async () => {
      mockTipCount.mockResolvedValueOnce(0).mockResolvedValueOnce(0);
      mockTipAggregate
        .mockResolvedValueOnce({ _sum: { amountStroops: null } })
        .mockResolvedValueOnce({ _sum: { amountStroops: null } });
      mockUserCount.mockResolvedValueOnce(0);

      await refreshPlatformStats();

      expect(mockCacheSetJSON).toHaveBeenCalledTimes(1);
      const [cacheKey, payload] = mockCacheSetJSON.mock.calls[0];
      expect(cacheKey).toBe('stats:platform');
      expect(payload).toMatchObject({
        totalTips: 0,
        totalVolumeStroops: '0',
        creatorCount: 0,
        activity24h: {
          tips: 0,
          volumeStroops: '0',
        },
        stale: false,
      });
      expect(mockLoggerInfo).toHaveBeenCalledWith(
        { totalTips: 0, creatorCount: 0 },
        'Platform stats refreshed',
      );
    });
  });

  describe('createPlatformStatsWorker & schedulePlatformStats', () => {
    it('executes refreshPlatformStats when the BullMQ worker processes a job', async () => {
      mockTipCount.mockResolvedValueOnce(12).mockResolvedValueOnce(4);
      mockTipAggregate
        .mockResolvedValueOnce({ _sum: { amountStroops: BigInt(50_000) } })
        .mockResolvedValueOnce({ _sum: { amountStroops: BigInt(10_000) } });
      mockUserCount.mockResolvedValueOnce(3);

      createPlatformStatsWorker();
      expect(processors).toHaveLength(1);
      expect(mockAttachDeadLetterHandler).toHaveBeenCalledTimes(1);

      await processors[0]({ id: 'job-1', name: 'refresh' });

      expect(mockCacheSetJSON).toHaveBeenCalledWith(
        'stats:platform',
        expect.objectContaining({
          totalTips: 12,
          totalVolumeStroops: '50000',
          creatorCount: 3,
          activity24h: { tips: 4, volumeStroops: '10000' },
        }),
        config.platformStats.cacheTtlSeconds,
      );
    });

    it('logs errors when a job fails', () => {
      createPlatformStatsWorker();
      expect(failedHandlers).toHaveLength(1);

      const failure = new Error('Database timeout');
      failedHandlers[0]({ id: 'job-fail-99' }, failure);

      expect(mockLoggerError).toHaveBeenCalledWith(
        { err: failure, jobId: 'job-fail-99' },
        'Platform stats job failed',
      );
    });

    it('schedules repeatable refresh job with configured cron pattern', async () => {
      await schedulePlatformStats();

      expect(mockScheduleRepeatable).toHaveBeenCalledWith({
        queue: { name: 'platform-stats' },
        name: 'refresh',
        pattern: config.platformStats.scheduleCron,
      });
    });
  });
});
