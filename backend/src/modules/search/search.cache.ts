import { createHash } from 'node:crypto';
import { redis } from '../../db/redis.js';
import { env } from '../../config/env.js';
import { logger } from '../../common/utils/logger.js';
import {
  getOrFill,
  recordCacheInvalidation,
  redisAvailable,
  withRedisTimeout,
} from '../../common/utils/cache.js';
import type { SearchCreatorsResponse } from './search.types.js';
import type { SearchSort } from './search.schema.js';

/**
 * Search result caching with event-driven invalidation (issue #1267).
 *
 * - Keys hash every query parameter by name, so no two distinct queries can
 *   share an entry.
 * - Fills go through `getOrFill`, so a stampede on a popular query runs the
 *   database query once across all instances.
 * - A profile write invalidates exactly the cached queries whose results it can
 *   change: every creator query that matches the profile's old or new
 *   username/display name, plus the (small) trending cache.
 * - Fills are stored with a compare-and-set on a write epoch, so a fill that
 *   read the database before a profile write can never re-cache stale rows
 *   after that write's invalidation ran.
 *
 * All keys share the `{search}` hash tag so the multi-key scripts stay on one
 * Redis Cluster slot.
 */

export const SEARCH_CACHE_TTL_SECONDS = env.SEARCH_CACHE_TTL_SECONDS ?? 60;

const NAMESPACE = 'search:{search}';
export const SEARCH_EPOCH_KEY = `${NAMESPACE}:epoch`;
/** Sorted set of cached normalized queries, scored by when their entries expire. */
export const SEARCH_QUERY_INDEX_KEY = `${NAMESPACE}:queries`;
/** Set of every cached trending key. */
export const SEARCH_TRENDING_KEYS_KEY = `${NAMESPACE}:trending-keys`;

/**
 * Stores a filled entry only if no profile write happened since the fill read
 * the epoch, and records the entry in its invalidation indexes.
 *
 * KEYS: epoch, cache entry, query index (zset), entry set for the query
 * ARGV: expected epoch, value, ttl seconds, normalized query ('' for trending), index score
 */
export const STORE_IF_CURRENT_SCRIPT = `
if (redis.call('GET', KEYS[1]) or '0') ~= ARGV[1] then
  return 0
end
redis.call('SET', KEYS[2], ARGV[2], 'EX', ARGV[3])
redis.call('SADD', KEYS[4], KEYS[2])
redis.call('EXPIRE', KEYS[4], ARGV[3])
if ARGV[4] ~= '' then
  redis.call('ZADD', KEYS[3], 'GT', ARGV[5], ARGV[4])
end
return 1`;

function digest(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex').slice(0, 32);
}

/** Canonical form of a search query; used for both the SQL filter and the cache key. */
export function normalizeSearchQuery(query: string): string {
  return query.trim().toLowerCase();
}

/** Cache key for a creator search; every parameter participates by name. */
export function creatorSearchKey(query: string, limit: number, offset: number, sort: SearchSort): string {
  return `${NAMESPACE}:creators:${digest({ q: query, limit, offset, sort })}`;
}

/** Cache key for a trending page. */
export function trendingKey(limit: number, offset: number): string {
  return `${NAMESPACE}:trending:${digest({ limit, offset })}`;
}

function queryEntriesKey(query: string): string {
  return `${NAMESPACE}:q:${digest(query)}`;
}

/** Upper bound for a whole invalidation pass, so a slow Redis never stalls the write path. */
const INVALIDATION_TIMEOUT_MS = 2_000;

async function readEpoch(): Promise<string | null> {
  if (!redisAvailable()) return null;
  try {
    return (await withRedisTimeout(redis.get(SEARCH_EPOCH_KEY))) ?? '0';
  } catch (err) {
    logger.warn({ err }, 'Search cache epoch read failed; result will not be cached');
    return null;
  }
}

/**
 * Read-through cached search. `query` must already be normalized; pass `''`
 * for the trending cache, which is not keyed by a query.
 */
export async function cachedSearch(
  cache: 'search_creators' | 'search_trending',
  key: string,
  query: string,
  run: () => Promise<SearchCreatorsResponse>,
): Promise<SearchCreatorsResponse> {
  let epoch: string | null = null;
  const entriesKey = query === '' ? SEARCH_TRENDING_KEYS_KEY : queryEntriesKey(query);

  return getOrFill({
    cache,
    key,
    ttlSeconds: SEARCH_CACHE_TTL_SECONDS,
    fill: async () => {
      // Read the epoch before touching the database: any profile write that
      // commits after this point bumps it and voids this fill's store.
      epoch = await readEpoch();
      return run();
    },
    store: async (serialized) => {
      if (epoch === null) return;
      await redis.eval(
        STORE_IF_CURRENT_SCRIPT,
        4,
        SEARCH_EPOCH_KEY,
        key,
        SEARCH_QUERY_INDEX_KEY,
        entriesKey,
        epoch,
        serialized,
        SEARCH_CACHE_TTL_SECONDS,
        query,
        Date.now() + SEARCH_CACHE_TTL_SECONDS * 1000,
      );
    },
  });
}

/**
 * Mirrors Postgres `ILIKE '%' || query || '%'` (with `%`/`_` wildcards and
 * backslash escapes) so invalidation targets every query a name could match.
 */
export function matchesSearchQuery(query: string, value: string): boolean {
  let pattern = '';
  for (let i = 0; i < query.length; i++) {
    const char = query[i];
    if (char === '\\' && i + 1 < query.length) {
      pattern += query[++i].replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    } else if (char === '%') {
      pattern += '[\\s\\S]*';
    } else if (char === '_') {
      pattern += '[\\s\\S]';
    } else {
      pattern += char.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }
  }
  return new RegExp(pattern, 'i').test(value);
}

async function dropEntrySet(setKey: string): Promise<number> {
  const entries = await redis.smembers(setKey);
  await redis.del(...entries, setKey);
  return entries.length;
}

/**
 * Invalidates cached searches affected by a profile create, update,
 * deactivation or reactivation. Pass the profile's names from before *and*
 * after the write. Must be called after the write has committed. Never throws:
 * a Redis failure leaves entries to expire by TTL.
 */
export async function invalidateCreatorSearch(
  names: Array<string | null | undefined>,
): Promise<void> {
  if (!redisAvailable()) {
    logger.warn('Redis unavailable; search cache entries will expire by TTL');
    return;
  }
  try {
    await withRedisTimeout(invalidate(names), INVALIDATION_TIMEOUT_MS);
  } catch (err) {
    logger.warn({ err }, 'Search cache invalidation failed; entries will expire by TTL');
  }
}

async function invalidate(names: Array<string | null | undefined>): Promise<void> {
  await redis.incr(SEARCH_EPOCH_KEY);

  const now = Date.now();
  await redis.zremrangebyscore(SEARCH_QUERY_INDEX_KEY, '-inf', now);
  const cachedQueries = await redis.zrangebyscore(SEARCH_QUERY_INDEX_KEY, now, '+inf');
  const candidates = names.filter((name): name is string => typeof name === 'string' && name.length > 0);
  const affected = cachedQueries.filter((query) =>
    candidates.some((name) => matchesSearchQuery(query, name)),
  );

  let creators = 0;
  for (const query of affected) {
    creators += await dropEntrySet(queryEntriesKey(query));
  }
  if (affected.length > 0) await redis.zrem(SEARCH_QUERY_INDEX_KEY, ...affected);

  // Trending lists every active creator regardless of name, so any profile
  // write can change it; it only holds a handful of pages.
  const trending = await dropEntrySet(SEARCH_TRENDING_KEYS_KEY);

  recordCacheInvalidation('search_creators', creators);
  recordCacheInvalidation('search_trending', trending);
  logger.debug({ affectedQueries: affected.length, creators, trending }, 'Search cache invalidated');
}
