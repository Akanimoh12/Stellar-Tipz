import { createServer } from 'node:http';
import { createApp } from './app.js';
import { env } from '@/config/env.js';
import { logger } from './common/utils/logger.js';
import { prisma } from './db/prisma.js';
import { redis } from './db/redis.js';
import { registerClosable, closeAll } from './common/utils/lifecycle.js';
import { startIndexer } from './indexer/index.js';

/** Process entry point: starts the HTTP server (and, later, the WebSocket + indexer). */
async function bootstrap(): Promise<void> {
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

  // Start the off-chain indexer poll loop and stop it on shutdown.
  const indexer = startIndexer();
  registerClosable({
    name: 'Indexer',
    close: async () => {
      indexer.stop();
    },
  });

  // The realtime gateway (Socket.IO) attaches to this httpServer — see the realtime issues.
  // initRealtime(httpServer);

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
