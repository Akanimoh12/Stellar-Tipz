import { prisma } from '../../db/prisma.js';
import { redis } from '../../db/redis.js';
import { env } from '../../config/env.js';
import { logger } from '../../common/utils/logger.js';
import type { SearchCreatorsResponse } from './search.types.js';

const CACHE_PREFIX = 'search:creators:';
const CACHE_TTL_SECONDS = env.SEARCH_CACHE_TTL_SECONDS ?? 60;

function cacheKey(query: string, limit: number, offset: number): string {
  return `${CACHE_PREFIX}${query.trim().toLowerCase()}:${limit}:${offset}`;
}

async function readCache(key: string): Promise<SearchCreatorsResponse | null> {
  try {
    const cached = await redis.get(key);
    return cached ? (JSON.parse(cached) as SearchCreatorsResponse) : null;
  } catch (err) {
    logger.warn({ err, key }, 'Search cache read failed');
    return null;
  }
}

async function writeCache(key: string, result: SearchCreatorsResponse): Promise<void> {
  try {
    await redis.set(key, JSON.stringify(result), 'EX', CACHE_TTL_SECONDS);
  } catch (err) {
    logger.warn({ err, key }, 'Search cache write failed');
  }
}

/**
 * Searches creators by name or username using case-insensitive partial matching.
 * Returns paginated results ordered by relevance (username match first, then displayName).
 * Results are cached in Redis, keyed by the normalized query and pagination params.
 */
export async function searchCreators(
  query: string,
  limit: number,
  offset: number,
): Promise<SearchCreatorsResponse> {
  const key = cacheKey(query, limit, offset);
  const cached = await readCache(key);
  if (cached) {
    return cached;
  }

  const where = {
    deletedAt: null,
    OR: [
      { username: { contains: query, mode: 'insensitive' as const } },
      { displayName: { contains: query, mode: 'insensitive' as const } },
    ],
  };

  const [rows, total] = await Promise.all([
    prisma.user.findMany({
      where,
      select: {
        id: true,
        username: true,
        displayName: true,
        stellarAddress: true,
        imageUrl: true,
        bio: true,
      },
      orderBy: [
        { username: 'asc' },
        { displayName: 'asc' },
      ],
      take: limit,
      skip: offset,
    }),
    prisma.user.count({ where }),
  ]);

  const result: SearchCreatorsResponse = {
    data: rows,
    pagination: {
      limit,
      offset,
      total,
      hasMore: offset + rows.length < total,
    },
  };

  await writeCache(key, result);
  return result;
}
