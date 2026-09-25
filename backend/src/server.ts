import { createServer } from 'node:http';
import { createApp } from './app.js';
import { env } from '@/config/env.js';
import { logger } from './common/utils/logger.js';
import { prisma } from './db/prisma.js';
import { redis } from './db/redis.js';
import { registerClosable, closeAll } from './common/utils/lifecycle.js';
import { initializeQueues, closeAllQueues } from './modules/jobs/queue.factory.js';
import { initRealtime } from './realtime/gateway.js';
import { initTracing, shutdownTracing } from './common/observability/tracing.js';

/** Process entry point: starts the HTTP server (and, later, the WebSocket + indexer). */
async function bootstrap(): Promise<void> {
  // Initialize OpenTelemetry tracing (issue #1349)
  initTracing();
  registerClosable({
    name: 'OpenTelemetry',
    close: shutdownTracing,
  });

  const app = createApp();
  const httpServer = createServer(app);

  // Register Prisma and Redis for graceful shutdown.
  registerClosable({
    name: 'Prisma',
    close: () => prisma.$disconnect(),
  });
  registerClosable({
    name: 'Redis',
    close: async () => {
      await redis.quit();
    },
  });

  // Initialize job queues (issue #1288, #1289, #1287)
  await initializeQueues();
  registerClosable({
    name: 'Job Queues',
    close: closeAllQueues,
  });

  // Initialize realtime gateway (issue #1286)
  initRealtime(httpServer);

  httpServer.listen(env.PORT, () => {
    logger.info(`🚀 Stellar Tipz backend listening on http://localhost:${env.PORT}`);
  });

  const shutdown = async (signal: string) => {
    logger.info(`${signal} received, shutting down...`);
    httpServer.close(async () => {
      await closeAll();
      logger.info('Graceful shutdown complete');
      process.exit(0);
    });
  };

  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
}

bootstrap().catch((err) => {
  logger.error({ err }, 'Fatal startup error');
  process.exit(1);
});
