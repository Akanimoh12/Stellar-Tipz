import { prisma } from '../../db/prisma.js';
import { NotFoundError } from '../../common/errors/AppError.js';
import type { NotificationListResponse, NotificationResponse } from './notifications.types.js';

function formatNotification(n: {
  id: string;
  type: string;
  payload: unknown;
  readAt: Date | null;
  createdAt: Date;
}): NotificationResponse {
  return {
    id: n.id,
    type: n.type,
    payload: n.payload,
    readAt: n.readAt?.toISOString() ?? null,
    createdAt: n.createdAt.toISOString(),
  };
}

export async function listNotifications(
  userId: string,
  unreadOnly: boolean,
  limit: number,
  offset: number,
): Promise<NotificationListResponse> {
  const where = {
    userId,
    deletedAt: null,
    ...(unreadOnly ? { readAt: null } : {}),
  };

  const [rows, total] = await Promise.all([
    prisma.notification.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: offset,
      take: limit,
    }),
    prisma.notification.count({ where }),
  ]);

  return {
    data: rows.map(formatNotification),
    pagination: {
      limit,
      offset,
      total,
      hasMore: offset + rows.length < total,
    },
  };
}

export async function getNotification(
  userId: string,
  notificationId: string,
): Promise<NotificationResponse> {
  const notification = await prisma.notification.findFirst({
    where: { id: notificationId, userId, deletedAt: null },
  });

  if (!notification) {
    throw new NotFoundError('Notification not found');
  }

  return formatNotification(notification);
}

export async function markAsRead(
  userId: string,
  notificationId: string,
): Promise<NotificationResponse> {
  const notification = await prisma.notification.findFirst({
    where: { id: notificationId, userId, deletedAt: null },
  });

  if (!notification) {
    throw new NotFoundError('Notification not found');
  }

  const updated = await prisma.notification.update({
    where: { id: notificationId },
    data: { readAt: new Date() },
  });

  return formatNotification(updated);
}

export async function markAllAsRead(userId: string): Promise<{ count: number }> {
  const result = await prisma.notification.updateMany({
    where: { userId, readAt: null, deletedAt: null },
    data: { readAt: new Date() },
  });

  return { count: result.count };
}
