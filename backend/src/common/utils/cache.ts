import { randomUUID } from 'node:crypto';
import { setTimeout as sleep } from 'node:timers/promises';
import { redis } from '../../db/redis.js';
import { logger } from './logger.js';
import { createCounter } from '../observability/prometheus.js';

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

/** Upper bound for a single Redis round trip on the cache paths below. */
export const REDIS_OP_TIMEOUT_MS = 500;

/**
 * True when the shared client can serve commands right now. While it is
 * connecting or reconnecting, ioredis queues commands indefinitely (the client
 * uses `maxRetriesPerRequest: null` for BullMQ), so cache paths must skip Redis
 * instead of awaiting it. Test doubles without a `status` count as available.
 */
export function redisAvailable(): boolean {
  const status = (redis as { status?: string }).status;
  return status === undefined || status === 'ready';
}

/** Rejects if `operation` does not settle within `ms`, so a slow Redis costs bounded latency. */
export async function withRedisTimeout<T>(operation: Promise<T>, ms = REDIS_OP_TIMEOUT_MS): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  try {
    return await Promise.race([
      operation,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error(`Redis operation timed out after ${ms}ms`)), ms);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Cache lookups by cache name and outcome, so hit/miss rates can be derived per
 * cache: `hit` = served from Redis, `miss` = this request ran the fill,
 * `coalesced` = waited on a fill already running here or on another instance.
 */
const cacheRequestsTotal = createCounter({
  name: 'cache_requests_total',
  help: 'Cache lookups by cache name and result (hit, miss, coalesced)',
  labelNames: ['cache', 'result'] as const,
});

const cacheInvalidationsTotal = createCounter({
  name: 'cache_invalidations_total',
  help: 'Cache entries (or entry generations) explicitly invalidated by a write, by cache name',
  labelNames: ['cache'] as const,
});

export type CacheLookupResult = 'hit' | 'miss' | 'coalesced';

/** Records a cache lookup outcome for the hit/miss rate metrics. */
export function recordCacheLookup(cache: string, result: CacheLookupResult): void {
  cacheRequestsTotal.inc({ cache, result });
}

/** Records entries dropped by an explicit (event-driven) invalidation. */
export function recordCacheInvalidation(cache: string, entries: number): void {
  if (entries > 0) cacheInvalidationsTotal.inc({ cache }, entries);
}

/** Compare-and-delete: releases a lock only if this caller still owns it. */
export const RELEASE_LOCK_SCRIPT = `
if redis.call('GET', KEYS[1]) == ARGV[1] then
  return redis.call('DEL', KEYS[1])
end
return 0`;

export interface GetOrFillOptions<T> {
  /** Metric label identifying the cache (e.g. `search_creators`). */
  cache: string;
  key: string;
  ttlSeconds: number;
  /** Computes the value on a miss. Only one caller across all instances runs it at a time. */
  fill: () => Promise<T>;
  /** Persists a freshly filled value. Defaults to `SET key value EX ttlSeconds`. */
  store?: (serialized: string) => Promise<unknown>;
  /** How long the fill lock is held before it self-expires (a crashed filler never wedges the key). */
  lockTtlMs?: number;
  /** How long a caller waits on another instance's fill before computing the value itself. */
  lockWaitMs?: number;
  /** Poll interval while waiting on another instance's fill. */
  lockPollMs?: number;
}

const DEFAULT_LOCK_TTL_MS = 5_000;
const DEFAULT_LOCK_WAIT_MS = 2_000;
const DEFAULT_LOCK_POLL_MS = 25;

/** In-process single-flight: concurrent misses on one instance share one fill. */
const inFlightFills = new Map<string, Promise<unknown>>();

type LockState = 'acquired' | 'busy' | 'unavailable';

/** Cache read for the fill paths: never throws and never waits on an unavailable Redis. */
async function readCached<T>(key: string): Promise<T | null> {
  if (!redisAvailable()) return null;
  try {
    return await withRedisTimeout(cacheGetJSON<T>(key));
  } catch (err) {
    logger.warn({ err, key }, 'Cache read timed out');
    return null;
  }
}

async function tryLock(lockKey: string, token: string, ttlMs: number): Promise<LockState> {
  if (!redisAvailable()) return 'unavailable';
  try {
    const result = await withRedisTimeout(redis.set(lockKey, token, 'PX', ttlMs, 'NX'));
    return result === 'OK' ? 'acquired' : 'busy';
  } catch (err) {
    logger.warn({ err, lockKey }, 'Cache fill lock unavailable; filling without it');
    return 'unavailable';
  }
}

async function releaseLock(lockKey: string, token: string): Promise<void> {
  try {
    await withRedisTimeout(redis.eval(RELEASE_LOCK_SCRIPT, 1, lockKey, token));
  } catch (err) {
    logger.warn({ err, lockKey }, 'Cache fill lock release failed; it will expire on its own');
  }
}

async function fillWithLock<T>(options: GetOrFillOptions<T>): Promise<T> {
  const lockKey = `${options.key}:lock`;
  const token = randomUUID();
  const lock = await tryLock(lockKey, token, options.lockTtlMs ?? DEFAULT_LOCK_TTL_MS);

  if (lock === 'busy') {
    // Another instance is filling this key: wait for its result instead of
    // hitting the database too. Give up after lockWaitMs so a slow or crashed
    // filler only costs bounded latency, never an outage.
    const deadline = Date.now() + (options.lockWaitMs ?? DEFAULT_LOCK_WAIT_MS);
    while (Date.now() < deadline) {
      await sleep(options.lockPollMs ?? DEFAULT_LOCK_POLL_MS);
      const filled = await readCached<T>(options.key);
      if (filled !== null) {
        recordCacheLookup(options.cache, 'coalesced');
        return filled;
      }
    }
  }

  try {
    if (lock === 'acquired') {
      // The previous lock holder may have stored the value between our read and our lock.
      const filled = await readCached<T>(options.key);
      if (filled !== null) {
        recordCacheLookup(options.cache, 'coalesced');
        return filled;
      }
    }

    recordCacheLookup(options.cache, 'miss');
    const value = await options.fill();
    const serialized = JSON.stringify(value);
    try {
      if (redisAvailable()) {
        await withRedisTimeout(
          options.store
            ? options.store(serialized)
            : redis.set(options.key, serialized, 'EX', options.ttlSeconds),
        );
      }
    } catch (err) {
      logger.warn({ err, key: options.key }, 'Cache fill store failed');
    }
    return value;
  } finally {
    if (lock === 'acquired') await releaseLock(lockKey, token);
  }
}

/**
 * Read-through cache with stampede protection. A hit returns the cached value;
 * on a miss exactly one caller (per key, across every instance) runs `fill`
 * under a Redis `SET NX PX` single-flight lock while the others wait for its
 * result. Redis failures degrade to calling `fill` directly.
 */
export async function getOrFill<T>(options: GetOrFillOptions<T>): Promise<T> {
  const cached = await readCached<T>(options.key);
  if (cached !== null) {
    recordCacheLookup(options.cache, 'hit');
    return cached;
  }

  const pending = inFlightFills.get(options.key);
  if (pending) {
    recordCacheLookup(options.cache, 'coalesced');
    return pending as Promise<T>;
  }

  const fill = fillWithLock(options).finally(() => inFlightFills.delete(options.key));
  inFlightFills.set(options.key, fill);
  return fill;
}
