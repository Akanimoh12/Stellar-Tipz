import Redis from 'ioredis';
import { config } from '../config/index.js';
import { logger } from '../common/utils/logger.js';

/**
 * Shared ioredis singleton.
 * Import `redis` wherever you need cache, rate-limiting, pub/sub or queues.
 *
 * Connection is established lazily on first use; errors are logged and the
 * process is not killed — callers should handle `null` returns gracefully.
 */
export const redis = new Redis(config.redis.redisUrl, {
  maxRetriesPerRequest: null, // required by BullMQ
  enableReadyCheck: false,
});

redis.on('connect', () => {
  logger.info('Redis connected');
});

redis.on('ready', () => {
  logger.info('Redis ready');
});

redis.on('error', (err) => {
  logger.error({ err }, 'Redis connection error');
});

redis.on('close', () => {
  logger.warn('Redis connection closed');
});

redis.on('reconnecting', () => {
  logger.info('Redis reconnecting...');
});
