import { prisma } from '../../db/prisma.js';
import { logger } from '../../common/utils/logger.js';
import type { SearchCreatorsResponse, SearchCreator } from './search.types.js';
import type { SearchSort } from './search.schema.js';
import { cachedSearch, creatorSearchKey, normalizeSearchQuery, trendingKey } from './search.cache.js';

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
 * Results are cached in Redis (see search.cache.ts): the query is normalized
 * once and that same value drives both the SQL and the cache key, and profile
 * writes invalidate the cached queries they affect.
 */
export async function searchCreators(
  rawQuery: string,
  limit: number,
  offset: number,
  sort: SearchSort = 'relevance',
): Promise<SearchCreatorsResponse> {
  const query = normalizeSearchQuery(rawQuery);
  logger.info({ query, limit, offset, sort }, 'Searching creators');

  return cachedSearch('search_creators', creatorSearchKey(query, limit, offset, sort), query, () =>
    runCreatorSearch(query, limit, offset, sort),
  );
}

async function runCreatorSearch(
  query: string,
  limit: number,
  offset: number,
  sort: SearchSort,
): Promise<SearchCreatorsResponse> {
  const where = buildWhere(query);

  if (sort === 'relevance') {
    return searchWithRelevanceRanking(query, where, limit, offset);
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
 * Results are cached in Redis and invalidated by any profile write.
 */
export async function getTrendingCreators(
  limit: number,
  offset: number,
): Promise<SearchCreatorsResponse> {
  logger.info({ limit, offset }, 'Getting trending creators');

  return cachedSearch('search_trending', trendingKey(limit, offset), '', () =>
    runTrending(limit, offset),
  );
}

async function runTrending(limit: number, offset: number): Promise<SearchCreatorsResponse> {
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
