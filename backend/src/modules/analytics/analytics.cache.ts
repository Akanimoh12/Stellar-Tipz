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

/**
 * Analytics result caching (issue #1265). See docs/CACHING.md.
 *
 * Entries are namespaced by a *generation* counter. Invalidation increments
 * the generation, which orphans every entry built under the old one at once;
 * orphans expire by TTL. A fill that read the database before an invalidation
 * stores under the old generation, so it can never resurface stale data.
 *
 * | Scope      | Endpoints                           | TTL                                   | Invalidated by                    |
 * |------------|-------------------------------------|---------------------------------------|-----------------------------------|
 * | `rollup`   | daily, summary, active-users        | ANALYTICS_ROLLUP_CACHE_TTL_SECONDS    | rollup job rewriting a day        |
 * | `platform` | volume, top-tippers                 | ANALYTICS_CACHE_TTL_SECONDS           | rollup jobs (TTL bounds tip churn)|
 * | `creator`  | creators/:username                  | ANALYTICS_CACHE_TTL_SECONDS           | that creator's tips changing      |
 */

export const ANALYTICS_CACHE_TTL_SECONDS = env.ANALYTICS_CACHE_TTL_SECONDS;
export const ANALYTICS_ROLLUP_CACHE_TTL_SECONDS = env.ANALYTICS_ROLLUP_CACHE_TTL_SECONDS;

export type AnalyticsCacheScope =
  | { kind: 'rollup' }
  | { kind: 'platform' }
  | { kind: 'creator'; address: string };

const NAMESPACE = 'analytics:{analytics}';
const ROLLUP_GENERATION_KEY = `${NAMESPACE}:gen:rollup`;
const PLATFORM_GENERATION_KEY = `${NAMESPACE}:gen:platform`;

function creatorGenerationKey(address: string): string {
  return `${NAMESPACE}:gen:creator:${address}`;
}

function generationKey(scope: AnalyticsCacheScope): string {
  if (scope.kind === 'rollup') return ROLLUP_GENERATION_KEY;
  if (scope.kind === 'platform') return PLATFORM_GENERATION_KEY;
  return creatorGenerationKey(scope.address);
}

function digest(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex').slice(0, 32);
}

/** Cache key for one analytics query; every parameter participates by name. */
export function analyticsCacheKey(
  scope: AnalyticsCacheScope,
  generation: string,
  query: string,
  params: Record<string, unknown>,
): string {
  const owner = scope.kind === 'creator' ? `creator:${scope.address}` : scope.kind;
  return `${NAMESPACE}:${owner}:${generation}:${digest({ query, ...params })}`;
}

async function readGeneration(scope: AnalyticsCacheScope): Promise<string | null> {
  if (!redisAvailable()) return null;
  try {
    return (await withRedisTimeout(redis.get(generationKey(scope)))) ?? '0';
  } catch (err) {
    logger.warn({ err }, 'Analytics cache generation read failed; serving uncached');
    return null;
  }
}

/**
 * Read-through cached analytics query. `params` must hold every input that
 * changes the result (use stable markers such as `null` for "default range",
 * never a timestamp derived from `now`).
 */
export async function cachedAnalytics<T>(
  scope: AnalyticsCacheScope,
  query: string,
  params: Record<string, unknown>,
  run: () => Promise<T>,
): Promise<T> {
  const generation = await readGeneration(scope);
  if (generation === null) return run();

  return getOrFill({
    cache: `analytics_${scope.kind}`,
    key: analyticsCacheKey(scope, generation, query, params),
    ttlSeconds: scope.kind === 'rollup' ? ANALYTICS_ROLLUP_CACHE_TTL_SECONDS : ANALYTICS_CACHE_TTL_SECONDS,
    fill: run,
  });
}

async function bumpGenerations(cache: string, keys: string[]): Promise<void> {
  if (!redisAvailable()) {
    logger.warn({ cache }, 'Redis unavailable; analytics cache entries will expire by TTL');
    return;
  }
  try {
    for (const key of keys) await withRedisTimeout(redis.incr(key));
    recordCacheInvalidation(cache, keys.length);
  } catch (err) {
    logger.warn({ err, cache }, 'Analytics cache invalidation failed; entries will expire by TTL');
  }
}

/** Call after the AnalyticsDaily rollup is rewritten. Never throws. */
export async function invalidateRollupAnalytics(): Promise<void> {
  await bumpGenerations('analytics_rollup', [ROLLUP_GENERATION_KEY, PLATFORM_GENERATION_KEY]);
}

/** Call after a creator's tips are created, confirmed or refunded. Never throws. */
export async function invalidateCreatorAnalytics(address: string): Promise<void> {
  await bumpGenerations('analytics_creator', [creatorGenerationKey(address)]);
}
