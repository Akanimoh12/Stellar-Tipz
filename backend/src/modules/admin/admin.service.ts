import { prisma } from '../../db/prisma.js';
import { logger } from '../../common/utils/logger.js';
import { NotFoundError } from '../../common/errors/AppError.js';
import type { ListUsersQuery } from './admin.schema.js';

export interface AdminUserResponse {
  id: string;
  username: string | null;
  displayName: string | null;
  stellarAddress: string;
  role: string;
  createdAt: string;
  deletedAt: string | null;
}

export interface ListUsersResponse {
  entries: AdminUserResponse[];
  total: number;
  page: number;
  limit: number;
}

export async function listUsers(query: ListUsersQuery): Promise<ListUsersResponse> {
  logger.info({ page: query.page, limit: query.limit, role: query.role }, 'Listing users');

  const where: Record<string, unknown> = {};
  if (query.role) {
    where.role = query.role;
  }

  const skip = (query.page - 1) * query.limit;

  const [users, total] = await Promise.all([
    prisma.user.findMany({
      where,
      select: {
        id: true,
        username: true,
        displayName: true,
        stellarAddress: true,
        role: true,
        createdAt: true,
        deletedAt: true,
      },
      orderBy: { createdAt: 'desc' },
      skip,
      take: query.limit,
    }),
    prisma.user.count({ where }),
  ]);

  const entries: AdminUserResponse[] = users.map((u) => ({
    id: u.id,
    username: u.username,
    displayName: u.displayName,
    stellarAddress: u.stellarAddress,
    role: u.role,
    createdAt: u.createdAt.toISOString(),
    deletedAt: u.deletedAt ? u.deletedAt.toISOString() : null,
  }));

  return { entries, total, page: query.page, limit: query.limit };
}

export async function suspendUser(userId: string, reason?: string): Promise<void> {
  logger.info({ userId, reason }, 'Suspending user');

  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user || user.deletedAt) {
    throw new NotFoundError(`User ${userId} not found`);
  }

  await prisma.user.update({
    where: { id: userId },
    data: { deletedAt: new Date() },
  });

  logger.info({ userId, reason }, 'User suspended');
}
