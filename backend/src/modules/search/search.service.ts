import { prisma } from '../../db/prisma.js';
import { logger } from '../../common/utils/logger.js';
import type { SearchCreatorsResponse, SearchCreator } from './search.types.js';
import type { SearchSort } from './search.schema.js';

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

  const where = buildWhere(query);

  if (sort === 'relevance') {
    return searchWithRelevanceRanking(query, where, limit, offset);
  }

  const orderBy = getOrderBy(sort);
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
      select: selectFields,
      orderBy,
      take: limit,
      skip: offset,
    }),
    prisma.user.count({ where }),
  ]);

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

function getOrderBy(sort: Exclude<SearchSort, 'relevance'>): Record<string, string>[] {
  switch (sort) {
    case 'recent':
      return [{ createdAt: 'desc' as const }];
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
