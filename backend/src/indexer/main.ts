import { pathToFileURL } from 'node:url';
import { logger } from '../common/utils/logger.js';
import { registerClosable, closeAllWithTimeout } from '../common/utils/lifecycle.js';
import { prisma, prismaIncludingDeleted } from '../db/prisma.js';
import { redis } from '../db/redis.js';
import { config } from '../config/index.js';
import { startIndexer } from './poller.js';
import { initTracing, shutdownTracing } from '../common/observability/tracing.js';
import { getMaxLeaderEpoch } from './cursor.js';
import { LeaderElector, type LeaseClient } from './leader.js';
import { startProcessMetrics } from '../common/observability/metricsServer.js';

/** Creates the Redis lease elector, or null when leader election is disabled (single instance). */
function createLeaderElector(): LeaderElector | null {
  const { leaderElection } = config.indexer;
  if (!leaderElection.enabled) {
    logger.warn('Indexer leader election disabled — run only one indexer instance');
    return null;
  }
  return new LeaderElector({
    redis: redis as unknown as LeaseClient,
    key: leaderElection.key,
    leaseMs: leaderElection.leaseMs,
    renewIntervalMs: leaderElection.renewIntervalMs,
    epochFloor: getMaxLeaderEpoch,
  });
}

/**
 * Standalone indexer process bootstrap. Starts leader election (issue #1263)
 * and the Soroban poll loop, and registers graceful shutdown for Prisma and
 * the indexer. Any number of instances may run; only the leader indexes.
 */
export async function bootstrapIndexer(): Promise<void> {
  // Initialize OpenTelemetry tracing (issue #1349)
  initTracing();
  registerClosable({
    name: 'OpenTelemetry',
    close: shutdownTracing,
  });
  await startProcessMetrics('indexer');

  registerClosable({
    name: 'Prisma',
    close: () => prisma.$disconnect(),
  });
  registerClosable({
    name: 'PrismaIncludingDeleted',
    close: () => prismaIncludingDeleted.$disconnect(),
  });
  // Registered before the indexer so it closes after it: the lease is released first.
  registerClosable({
    name: 'Redis',
    close: async () => {
      await redis.quit();
    },
  });

  const leader = createLeaderElector();
  leader?.start();
  const indexer = startIndexer({ leader: leader ?? undefined });
  registerClosable({
    name: 'Indexer',
    close: async () => {
      // Stop polling first, then release the lease so a standby takes over at once.
      await indexer.stop();
      await leader?.stop();
    },
  });

  logger.info('Indexer process started');

  let shuttingDown = false;
  const shutdown = async (signal: string) => {
    if (shuttingDown) return;
    shuttingDown = true;
    logger.info(`${signal} received, shutting down indexer...`);
    const completed = await closeAllWithTimeout(30_000, () => process.exit(1));
    if (completed) {
      logger.info('Indexer shutdown complete');
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
  bootstrapIndexer().catch((err) => {
    logger.error({ err }, 'Fatal indexer startup error');
    process.exit(1);
  });
}
