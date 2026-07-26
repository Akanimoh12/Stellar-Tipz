import { prisma } from '../../db/prisma.js';
import type { SearchCreatorsResponse } from './search.types.js';

/**
 * Searches creators by name or username using case-insensitive partial matching.
 * Returns paginated results ordered by relevance (username match first, then displayName).
 */
export async function searchCreators(
  query: string,
  limit: number,
  offset: number,
): Promise<SearchCreatorsResponse> {
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

  return {
    data: rows,
    pagination: {
      limit,
      offset,
      total,
      hasMore: offset + rows.length < total,
    },
  };
}
