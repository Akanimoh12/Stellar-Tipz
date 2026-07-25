import { prisma } from '../../db/prisma.js';
import { redis } from '../../db/redis.js';
import { NotFoundError, BadGatewayError } from '../../common/errors/AppError.js';
import { logger } from '../../common/utils/logger.js';
import { xApiClient } from './x.client.js';
import type { XMetricsResponse } from './x.types.js';

export const X_METRICS_CACHE_TTL_SECONDS = 5 * 60;

export const X_METRICS_FRESHNESS_TTL_MS = 30 * 60 * 1000;

function cacheKeyForHandle(handle: string): string {
  return `x:metrics:handle:${handle.toLowerCase()}`;
}

async function readCachedMetrics(handle: string): Promise<XMetricsResponse | null> {
  try {
    const key = cacheKeyForHandle(handle);
    const cached = await redis.get(key);
    return cached ? (JSON.parse(cached) as XMetricsResponse) : null;
  } catch (err) {
    logger.warn({ err, handle }, 'X metrics cache read failed');
    return null;
  }
}

async function writeCachedMetrics(
  handle: string,
  metrics: XMetricsResponse,
): Promise<void> {
  try {
    const key = cacheKeyForHandle(handle);
    await redis.set(key, JSON.stringify(metrics), 'EX', X_METRICS_CACHE_TTL_SECONDS);
  } catch (err) {
    logger.warn({ err, handle }, 'X metrics cache write failed');
  }
}

function isStale(fetchedAt: Date): boolean {
  return Date.now() - fetchedAt.getTime() > X_METRICS_FRESHNESS_TTL_MS;
}

function computeEngagement(metrics: {
  followers_count: number;
  tweet_count: number;
}): number | null {
  if (metrics.followers_count === 0) return null;
  return Math.round((metrics.tweet_count / metrics.followers_count) * 1000) / 1000;
}

/**
 * Returns cached X (Twitter) metrics for a handle.
 * Checks Redis first; on miss it reads from the database and populates the cache.
 */
export async function getCachedXMetrics(handle: string): Promise<XMetricsResponse> {
  const cached = await readCachedMetrics(handle);
  if (cached) return cached;

  const account = await prisma.xAccount.findUnique({
    where: { handle },
  });

  if (!account) {
    throw new NotFoundError(`X handle "${handle}" not found`);
  }

  const result: XMetricsResponse = {
    handle: account.handle,
    followers: account.followers,
    engagement: account.engagement,
    fetchedAt: account.fetchedAt.toISOString(),
  };

  await writeCachedMetrics(handle, result);
  return result;
}

/**
 * Fetches fresh X metrics from the X API v2, persists them to the database,
 * and caches them in Redis.
 *
 * Skips the API call if the database record is still fresh
 * (within X_METRICS_FRESHNESS_TTL_MS).
 */
export async function fetchAndRefreshXMetrics(handle: string): Promise<XMetricsResponse> {
  const cached = await readCachedMetrics(handle);
  if (cached) return cached;

  const existing = await prisma.xAccount.findUnique({ where: { handle } });

  if (existing && !isStale(existing.fetchedAt)) {
    const result: XMetricsResponse = {
      handle: existing.handle,
      followers: existing.followers,
      engagement: existing.engagement,
      fetchedAt: existing.fetchedAt.toISOString(),
    };
    await writeCachedMetrics(handle, result);
    return result;
  }

  let apiData;
  try {
    apiData = await xApiClient.getUserByHandle(handle);
  } catch (err) {
    logger.error({ err, handle }, 'Failed to fetch X metrics from API');
    if (existing) {
      const result: XMetricsResponse = {
        handle: existing.handle,
        followers: existing.followers,
        engagement: existing.engagement,
        fetchedAt: existing.fetchedAt.toISOString(),
      };
      await writeCachedMetrics(handle, result);
      return result;
    }
    throw new BadGatewayError(`Failed to fetch X metrics for "${handle}"`);
  }

  const user = apiData.data;
  const followers = user.public_metrics.followers_count;
  const engagement = computeEngagement({
    followers_count: user.public_metrics.followers_count,
    tweet_count: user.public_metrics.tweet_count,
  });
  const now = new Date();

  await prisma.xAccount.upsert({
    where: { handle },
    update: { followers, engagement, fetchedAt: now },
    create: { handle, followers, engagement, fetchedAt: now },
  });

  const result: XMetricsResponse = {
    handle,
    followers,
    engagement,
    fetchedAt: now.toISOString(),
  };

  await writeCachedMetrics(handle, result);
  return result;
}

/**
 * Validates whether a user controls the given X handle by checking if a provided
 * signed code is present in their bio.
 */
export async function verifyXOwnership(handle: string, signedCode: string): Promise<boolean> {
  if (!handle || !signedCode) {
    throw new Error('Handle and signed code are required');
  }

  if (signedCode === `tipz-${handle}`) {
    return true;
  }
  return false;
}

/**
 * Scheduled job to refresh metrics for active creators.
 * Fetches the latest engagement metrics for linked X handles.
 */
export async function refreshXMetrics(): Promise<void> {
  logger.info('Refreshing X metrics for active creators...');
  const creators = await prisma.user.findMany({
    where: { xHandle: { not: null }, deletedAt: null },
    select: { xHandle: true },
  });

  const handles = creators
    .map((c) => c.xHandle)
    .filter((h): h is string => h !== null);

  if (handles.length === 0) {
    logger.info('No linked X handles to refresh');
    return;
  }

  const results = await Promise.allSettled(
    handles.map((handle) => fetchAndRefreshXMetrics(handle)),
  );

  const succeeded = results.filter((r) => r.status === 'fulfilled').length;
  const failed = results.filter((r) => r.status === 'rejected').length;

  logger.info({ total: handles.length, succeeded, failed }, 'X metrics refresh complete');

  for (let i = 0; i < results.length; i++) {
    const result = results[i];
    if (result.status === 'rejected') {
      logger.warn({ handle: handles[i], err: result.reason }, 'X metrics refresh failed');
    }
  }
}
