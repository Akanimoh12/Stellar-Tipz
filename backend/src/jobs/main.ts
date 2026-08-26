import { pathToFileURL } from 'node:url';
import { logger } from '../common/utils/logger.js';
import { registerClosable, closeAll } from '../common/utils/lifecycle.js';
import { prisma, prismaIncludingDeleted } from '../db/prisma.js';
import { redis } from '../db/redis.js';
import {
  createCreditRecomputeWorker,
  scheduleCreditRecompute,
  createAnalyticsDailyWorker,
  scheduleAnalyticsDaily,
  createSubscriptionChargeWorker,
  scheduleSubscriptionCharge,
  createLeaderboardSnapshotWorker,
  scheduleLeaderboardSnapshot,
  createXMetricsRefreshWorker,
  scheduleXMetricsRefresh,
  createDiscoveryWorker,
  scheduleDiscovery,
  createPlatformStatsWorker,
  schedulePlatformStats,
  createPayoutWorker,
  schedulePayouts,
  createRetentionWorker,
  scheduleRetentionPrune,
} from './index.js';

/**
 * Standalone jobs process bootstrap. Starts all BullMQ workers and registers
 * graceful shutdown for Prisma, Redis, and every worker.
 */
export async function bootstrapJobs(): Promise<void> {
  registerClosable({ name: 'Prisma', close: () => prisma.$disconnect() });
  registerClosable({ name: 'PrismaIncludingDeleted', close: () => prismaIncludingDeleted.$disconnect() });
  registerClosable({ name: 'Redis', close: async () => { await redis.quit(); } });

  const creditWorker = createCreditRecomputeWorker();
  registerClosable({
    name: 'CreditRecomputeWorker',
    close: async () => {
      await creditWorker.close();
    },
  });
  await scheduleCreditRecompute();

  const analyticsWorker = createAnalyticsDailyWorker();
  registerClosable({
    name: 'AnalyticsDailyWorker',
    close: async () => {
      await analyticsWorker.close();
    },
  });
  await scheduleAnalyticsDaily();

  const subscriptionWorker = createSubscriptionChargeWorker();
  registerClosable({
    name: 'SubscriptionChargeWorker',
    close: async () => {
      await subscriptionWorker.close();
    },
  });
  await scheduleSubscriptionCharge();

  const leaderboardSnapshotWorker = createLeaderboardSnapshotWorker();
  registerClosable({
    name: 'LeaderboardSnapshotWorker',
    close: async () => {
      await leaderboardSnapshotWorker.close();
    },
  });
  await scheduleLeaderboardSnapshot();

  const xMetricsRefreshWorker = createXMetricsRefreshWorker();
  registerClosable({
    name: 'XMetricsRefreshWorker',
    close: async () => {
      await xMetricsRefreshWorker.close();
    },
  });
  await scheduleXMetricsRefresh();

  const discoveryWorker = createDiscoveryWorker();
  registerClosable({
    name: 'DiscoveryWorker',
    close: async () => {
      await discoveryWorker.close();
    },
  });
  await scheduleDiscovery();

  const platformStatsWorker = createPlatformStatsWorker();
  registerClosable({
    name: 'PlatformStatsWorker',
    close: async () => {
      await platformStatsWorker.close();
    },
  });
  await schedulePlatformStats();

  const payoutWorker = createPayoutWorker();
  registerClosable({
    name: 'PayoutWorker',
    close: async () => {
      await payoutWorker.close();
    },
  });
  await schedulePayouts();

  const retentionWorker = createRetentionWorker();
  registerClosable({
    name: 'RetentionWorker',
    close: async () => {
      await retentionWorker.close();
    },
  });
  await scheduleRetentionPrune();

  logger.info('Jobs process started');

  let shuttingDown = false;
  const shutdown = async (signal: string) => {
    if (shuttingDown) return;
    shuttingDown = true;
    logger.info(`${signal} received, shutting down jobs...`);
    const completed = await closeAllWithTimeout(30_000, () => process.exit(1));
    if (completed) {
      logger.info('Jobs shutdown complete');
      process.exit(0);
    }
  };

  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
}

const isDirectRun =
  typeof process.argv[1] === 'string' &&
  import.meta.url === pathToFileURL(process.argv[1]).href;

if (isDirectRun) {
  bootstrapJobs().catch((err) => {
    logger.error({ err }, 'Fatal jobs startup error');
    process.exit(1);
  });
}
