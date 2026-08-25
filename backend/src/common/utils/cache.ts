import { redis } from '../../db/redis.js';
import { logger } from './logger.js';

/**
 * Small JSON-friendly cache helpers built on the shared Redis connection.
 * All functions degrade gracefully: a Redis failure logs and behaves as a
 * cache miss rather than throwing, so callers never fail because the cache is
 * unavailable.
 */

export async function cacheGetJSON<T>(key: string): Promise<T | null> {
  try {
    const raw = await redis.get(key);
    if (!raw) return null;
    return JSON.parse(raw) as T;
  } catch (err) {
    logger.warn({ err, key }, 'cacheGetJSON failed');
    return null;
  }
}

export async function cacheSetJSON(
  key: string,
  value: unknown,
  ttlSeconds: number,
): Promise<void> {
  try {
    await redis.set(key, JSON.stringify(value), 'EX', ttlSeconds);
  } catch (err) {
    logger.warn({ err, key }, 'cacheSetJSON failed');
  }
}

export async function cacheDelete(key: string): Promise<void> {
  try {
    await redis.del(key);
  } catch (err) {
    logger.warn({ err, key }, 'cacheDelete failed');
  }
}
