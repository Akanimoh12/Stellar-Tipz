import { prisma } from '../../db/prisma.js';
import { config } from '../../config/index.js';
import { cacheGetJSON, cacheSetJSON } from '../../common/utils/cache.js';
import type { PlatformStatsResponse } from './stats.types.js';

const PLATFORM_STATS_CACHE_KEY = 'stats:platform';

/** Creators are "active" if they have received at least one confirmed tip and are not excluded. */
function activeCreatorWhere() {
  return {
    deletedAt: null,
    deactivatedAt: null,
    blockedAt: null,
    flaggedUnverified: false,
    receivedTips: { some: { status: 'CONFIRMED' as const } },
  };
}

/**
 * Aggregates real platform stats from the tip ledger. Throws if the data source
 * is unavailable so callers can fall back to a null/stale payload instead of
 * fabricating numbers.
 */
export async function computePlatformStats(now = new Date()): Promise<PlatformStatsResponse> {
  const since24h = new Date(now.getTime() - 24 * 60 * 60 * 1000);

  const [totalTips, totalVolumeAgg, creatorCount, last24hTips, last24hVolumeAgg] =
    await Promise.all([
      prisma.tip.count({ where: { status: 'CONFIRMED' } }),
      prisma.tip.aggregate({ where: { status: 'CONFIRMED' }, _sum: { amountStroops: true } }),
      prisma.user.count({ where: activeCreatorWhere() }),
      prisma.tip.count({ where: { status: 'CONFIRMED', createdAt: { gte: since24h } } }),
      prisma.tip.aggregate({
        where: { status: 'CONFIRMED', createdAt: { gte: since24h } },
        _sum: { amountStroops: true },
      }),
    ]);

  return {
    totalTips,
    totalVolumeStroops: (totalVolumeAgg._sum.amountStroops ?? BigInt(0)).toString(),
    creatorCount,
    activity24h: {
      tips: last24hTips,
      volumeStroops: (last24hVolumeAgg._sum.amountStroops ?? BigInt(0)).toString(),
    },
    generatedAt: now.toISOString(),
    stale: false,
  };
}

/**
 * Returns platform stats from cache (precomputed by the stats job). If the cache
 * is cold it computes once and caches. If the source is unavailable it returns
 * null fields with `stale: true` — never fabricated numbers.
 */
export async function getPlatformStats(): Promise<PlatformStatsResponse> {
  const cached = await cacheGetJSON<PlatformStatsResponse>(PLATFORM_STATS_CACHE_KEY);
  if (cached) return cached;

  try {
    const computed = await computePlatformStats();
    await cacheSetJSON(PLATFORM_STATS_CACHE_KEY, computed, config.platformStats.cacheTtlSeconds);
    return computed;
  } catch {
    return {
      totalTips: null,
      totalVolumeStroops: null,
      creatorCount: null,
      activity24h: { tips: null, volumeStroops: null },
      generatedAt: new Date().toISOString(),
      stale: true,
    };
  }
}
