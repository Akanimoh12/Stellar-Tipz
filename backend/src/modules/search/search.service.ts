import { prisma } from '../../db/prisma.js';
import { redis } from '../../db/redis.js';
import { env } from '../../config/env.js';
import { logger } from '../../common/utils/logger.js';
import type { SearchCreatorsResponse, SearchCreator } from './search.types.js';
import type { SearchSort } from './search.schema.js';

const CACHE_PREFIX = 'search:creators:';
const CACHE_TTL_SECONDS = env.SEARCH_CACHE_TTL_SECONDS ?? 60;

function cacheKey(query: string, limit: number, offset: number, sort: string = 'relevance'): string {
  return `${CACHE_PREFIX}${query.trim().toLowerCase()}:${limit}:${offset}:${sort}`;
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

function buildWhere(query: string): Record<string, unknown> {
  return {
    deletedAt: null,
    OR: [
      { username: { contains: query, mode: 'insensitive' as const } },
      { displayName: { contains: query, mode: 'insensitive' as const } },
    ],
  };
}

const selectFields = {
  id: true,
  username: true,
  displayName: true,
  stellarAddress: true,
  imageUrl: true,
  bio: true,
} as const;

/**
 * Searches creators by name or username using case-insensitive partial matching.
 * Supports relevance, recent, and popular sort orders with pagination.
 * Returns paginated results ordered by relevance (username match first, then displayName).
 * Results are cached in Redis, keyed by the normalized query and pagination params.
 */
export async function searchCreators(
  query: string,
  limit: number,
  offset: number,
  sort: SearchSort = 'relevance',
): Promise<SearchCreatorsResponse> {
  logger.info({ query, limit, offset, sort }, 'Searching creators');

  const key = cacheKey(query, limit, offset, sort);
  const cached = await readCache(key);
  if (cached) {
    return cached;
  }

  const where = buildWhere(query);

  let result: SearchCreatorsResponse;

  if (sort === 'relevance') {
    result = await searchWithRelevanceRanking(query, where, limit, offset);
  } else {
    const orderBy = getOrderBy(sort);
    const [rows, total] = await Promise.all([
      prisma.user.findMany({
        where,
        select: selectFields,
        orderBy,
        take: limit,
        skip: offset,
      }),
      prisma.user.count({ where }),
    ]);

    result = {
      data: rows as unknown as SearchCreator[],
      pagination: {
        limit,
        offset,
        total,
        hasMore: offset + rows.length < total,
      },
    };
  }

  await writeCache(key, result);
  return result;
}

function getOrderBy(sort: Exclude<SearchSort, 'relevance'>): Record<string, unknown>[] {
  switch (sort) {
    case 'recent':
      return [{ createdAt: 'desc' as const }];
    case 'popular':
      return [{ receivedTips: { _count: 'desc' as const } }];
    default:
      return [{ createdAt: 'desc' as const }];
  }
}

/**
 * Relevance-ranked search using raw SQL.
 * Exact username matches rank highest, followed by exact displayName matches,
 * then username/displayName partial matches ordered alphabetically.
 */
async function searchWithRelevanceRanking(
  query: string,
  where: Record<string, unknown>,
  limit: number,
  offset: number,
): Promise<SearchCreatorsResponse> {
  const likePattern = `%${query}%`;

  const rows = await prisma.$queryRaw<
    Array<{
      id: string;
      username: string | null;
      displayName: string | null;
      stellarAddress: string;
      imageUrl: string | null;
      bio: string | null;
    }>
  >`
    SELECT id, username, "displayName", "stellarAddress", "imageUrl", bio
    FROM "User"
    WHERE "deletedAt" IS NULL
      AND (username ILIKE ${likePattern} OR "displayName" ILIKE ${likePattern})
    ORDER BY
      CASE
        WHEN LOWER(username) = LOWER(${query}) THEN 0
        WHEN LOWER("displayName") = LOWER(${query}) THEN 1
        WHEN username ILIKE ${likePattern} THEN 2
        ELSE 3
      END,
      username ASC
    LIMIT ${limit}
    OFFSET ${offset}
  `;

  const total = await prisma.user.count({ where });

  return {
    data: rows as unknown as SearchCreator[],
    pagination: {
      limit,
      offset,
      total,
      hasMore: offset + rows.length < total,
    },
  };
}

/**
 * Gets trending creators based on received tips.
 * Results are cached in Redis.
 */
export async function getTrendingCreators(
  limit: number,
  offset: number,
): Promise<SearchCreatorsResponse> {
  logger.info({ limit, offset }, 'Getting trending creators');

  const key = `search:trending:${limit}:${offset}`;
  const cached = await readCache(key);
  if (cached) {
    return cached;
  }

  const [rows, total] = await Promise.all([
    prisma.user.findMany({
      where: { deletedAt: null },
      select: selectFields,
      orderBy: {
        receivedTips: {
          _count: 'desc',
        },
      },
      take: limit,
      skip: offset,
    }),
    prisma.user.count({ where: { deletedAt: null } }),
  ]);

  const result = {
    data: rows as unknown as SearchCreator[],
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
