import { prisma } from '../../db/prisma.js';
import { config } from '../../config/index.js';
import { cacheGetJSON, cacheSetJSON } from '../../common/utils/cache.js';
import { NotFoundError } from '../../common/errors/AppError.js';
import {
  TRENDING_FORMULA_DESCRIPTION,
  type SimilarCreator,
  type SimilarResponse,
  type TrendingCreator,
  type TrendingResponse,
} from './discovery.types.js';

const TRENDING_CACHE_KEY = 'discovery:trending';
export const similarCacheKey = (username: string) =>
  `discovery:similar:${username.toLowerCase()}`;

/** A single confirmed tip used as input to the pure ranking functions. */
interface TipInput {
  toAddress: string;
  amountStroops: bigint;
  createdAt: Date;
}

/**
 * Pure recency-weighted scoring. For each tip, weight = 0.5^(ageHours / (halflifeDays*24))
 * and the score contribution is amount * weight. Returns a map of address -> score.
 * Exposed separately so it can be unit-tested without a database.
 */
export function computeTrendingScores(
  tips: TipInput[],
  now: Date,
  halflifeDays: number,
): Map<string, number> {
  const halflifeHours = halflifeDays * 24;
  const scores = new Map<string, number>();
  const nowMs = now.getTime();

  for (const tip of tips) {
    const ageHours = Math.max(0, (nowMs - tip.createdAt.getTime()) / 3_600_000);
    const weight = Math.pow(0.5, ageHours / halflifeHours);
    const contribution = Number(tip.amountStroops) * weight;
    scores.set(tip.toAddress, (scores.get(tip.toAddress) ?? 0) + contribution);
  }

  return scores;
}

/** Pure ranking: returns addresses sorted by score descending (stable tie-break by address). */
export function rankAddresses(
  scores: Map<string, number>,
  topN: number,
): string[] {
  return [...scores.entries()]
    .sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1))
    .slice(0, topN)
    .map(([address]) => address);
}

/**
 * Filters out creators that must not appear in public discovery surfaces:
 * soft-deleted, deactivated, admin-blocked, or flagged as unverified.
 */
export function isExcludedCreator(user: {
  deletedAt: Date | null;
  deactivatedAt: Date | null;
  blockedAt: Date | null;
  flaggedUnverified: boolean;
}): boolean {
  return (
    user.deletedAt !== null ||
    user.deactivatedAt !== null ||
    user.blockedAt !== null ||
    user.flaggedUnverified
  );
}

interface TrendingRow {
  toAddress: string;
  amountStroops: bigint;
  createdAt: Date;
}

/**
 * Computes the recency-weighted trending ranking from confirmed tips in the
 * rolling window, hydrates creator profiles, and excludes ineligible creators.
 */
export async function computeTrending(now = new Date()): Promise<TrendingResponse> {
  const windowDays = config.discovery.trendingWindowDays;
  const halflifeDays = config.discovery.trendingHalflifeDays;
  const since = new Date(now.getTime() - windowDays * 24 * 60 * 60 * 1000);

  const tips = await prisma.tip.findMany({
    where: { status: 'CONFIRMED', createdAt: { gte: since } },
    select: { toAddress: true, amountStroops: true, createdAt: true },
  });

  const scores = computeTrendingScores(tips as TipInput[], now, halflifeDays);
  const ranked = rankAddresses(scores, config.discovery.trendingTopN);

  // Aggregate raw volume / count per creator within the window for display.
  const volumeByAddress = new Map<string, { volume: bigint; count: number }>();
  for (const tip of tips as TrendingRow[]) {
    const cur = volumeByAddress.get(tip.toAddress) ?? { volume: BigInt(0), count: 0 };
    cur.volume += tip.amountStroops;
    cur.count += 1;
    volumeByAddress.set(tip.toAddress, cur);
  }

  const users = await prisma.user.findMany({
    where: {
      stellarAddress: { in: ranked },
      deletedAt: null,
      deactivatedAt: null,
      blockedAt: null,
      flaggedUnverified: false,
    },
    select: {
      id: true,
      username: true,
      stellarAddress: true,
      displayName: true,
      imageUrl: true,
      avatarCid: true,
    },
  });
  const userMap = new Map(users.map((u) => [u.stellarAddress, u]));

  const data: TrendingCreator[] = ranked
    .map((address, index) => {
      const user = userMap.get(address);
      if (!user) return null; // excluded or missing profile
      const vol = volumeByAddress.get(address) ?? { volume: BigInt(0), count: 0 };
      return {
        rank: index + 1,
        userId: user.id,
        username: user.username,
        stellarAddress: user.stellarAddress,
        displayName: user.displayName,
        imageUrl: user.imageUrl,
        avatarCid: user.avatarCid,
        trendingScore: scores.get(address) ?? 0,
        recentVolumeStroops: vol.volume.toString(),
        recentTipCount: vol.count,
      };
    })
    .filter((e): e is TrendingCreator => e !== null)
    .map((entry, index) => ({ ...entry, rank: index + 1 }));

  return {
    data,
    windowDays,
    generatedAt: now.toISOString(),
    stale: false,
  };
}

/** Serves trending from cache; computes on demand (and caches) when cold. */
export async function getTrending(limit: number, offset: number): Promise<TrendingResponse> {
  const cached = await cacheGetJSON<TrendingResponse>(TRENDING_CACHE_KEY);
  if (cached) {
    return { ...cached, data: cached.data.slice(offset, offset + limit) };
  }

  try {
    const computed = await computeTrending();
    await cacheSetJSON(TRENDING_CACHE_KEY, computed, config.discovery.cacheTtlSeconds);
    return { ...computed, data: computed.data.slice(offset, offset + limit) };
  } catch {
    return {
      data: [],
      windowDays: config.discovery.trendingWindowDays,
      generatedAt: new Date().toISOString(),
      stale: true,
    };
  }
}

interface SimilarSupporterRow {
  toAddress: string;
  fromAddress: string;
}

/**
 * Computes creators similar to `username` based on overlapping supporters.
 * Two creators are similar in proportion to the number of distinct tippers they
 * share. Pure ranking logic is split out for testability.
 */
export function rankByOverlap(
  supporters: Set<string>,
  tips: SimilarSupporterRow[],
  topN: number,
): { address: string; shared: number; total: number }[] {
  const overlap = new Map<string, Set<string>>();
  for (const tip of tips) {
    if (tip.toAddress === tip.fromAddress) continue;
    if (!supporters.has(tip.fromAddress)) continue;
    const set = overlap.get(tip.toAddress) ?? new Set<string>();
    set.add(tip.fromAddress);
    overlap.set(tip.toAddress, set);
  }
  return [...overlap.entries()]
    .map(([address, set]) => ({ address, shared: set.size, total: set.size }))
    .sort((a, b) => b.shared - a.shared || (a.address < b.address ? -1 : 1))
    .slice(0, topN);
}

/** Computes similar creators for a given username from the tip ledger. */
export async function computeSimilar(
  username: string,
  now = new Date(),
): Promise<SimilarResponse> {
  const user = await prisma.user.findUnique({
    where: { username },
    select: { id: true, stellarAddress: true },
  });
  if (!user) throw new NotFoundError('Creator not found');

  const supportersRows = await prisma.tip.findMany({
    where: { toAddress: user.stellarAddress, status: 'CONFIRMED' },
    select: { fromAddress: true },
    distinct: ['fromAddress'],
  });
  const supporters = new Set(supportersRows.map((r) => r.fromAddress));

  if (supporters.size === 0) {
    return {
      data: [],
      forUsername: username,
      generatedAt: now.toISOString(),
      stale: false,
    };
  }

  const tips = await prisma.tip.findMany({
    where: {
      fromAddress: { in: [...supporters] },
      toAddress: { not: user.stellarAddress },
      status: 'CONFIRMED',
    },
    select: { toAddress: true, fromAddress: true },
  });

  const ranked = rankByOverlap(supporters, tips as SimilarSupporterRow[], config.discovery.similarTopN);

  const users = await prisma.user.findMany({
    where: {
      stellarAddress: { in: ranked.map((r) => r.address) },
      deletedAt: null,
      deactivatedAt: null,
      blockedAt: null,
      flaggedUnverified: false,
    },
    select: {
      username: true,
      stellarAddress: true,
      displayName: true,
      imageUrl: true,
      avatarCid: true,
    },
  });
  const userMap = new Map(users.map((u) => [u.stellarAddress, u]));

  const data: SimilarCreator[] = ranked
    .map((r) => {
      const u = userMap.get(r.address);
      if (!u) return null;
      return {
        username: u.username,
        stellarAddress: u.stellarAddress,
        displayName: u.displayName,
        imageUrl: u.imageUrl,
        avatarCid: u.avatarCid,
        sharedSupporters: r.shared,
        supporterCount: r.total,
      };
    })
    .filter((e): e is SimilarCreator => e !== null);

  return {
    data,
    forUsername: username,
    generatedAt: now.toISOString(),
    stale: false,
  };
}

/** Serves similar-creator recommendations from cache; computes on demand when cold. */
export async function getSimilar(username: string, limit: number): Promise<SimilarResponse> {
  const key = similarCacheKey(username);
  const cached = await cacheGetJSON<SimilarResponse>(key);
  if (cached) {
    return { ...cached, data: cached.data.slice(0, limit) };
  }
  try {
    const computed = await computeSimilar(username);
    await cacheSetJSON(key, computed, config.discovery.cacheTtlSeconds);
    return { ...computed, data: computed.data.slice(0, limit) };
  } catch (err) {
    if (err instanceof NotFoundError) throw err;
    return {
      data: [],
      forUsername: username,
      generatedAt: new Date().toISOString(),
      stale: true,
    };
  }
}

export { TRENDING_FORMULA_DESCRIPTION };
