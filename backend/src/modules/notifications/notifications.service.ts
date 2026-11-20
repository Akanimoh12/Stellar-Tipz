import { prisma } from "../../db/prisma.js";
import { logger } from "../../common/utils/logger.js";
import { NotFoundError } from "../../common/errors/AppError.js";
import type { PaginatedNotifications } from "./notifications.types.js";

const DEFAULT_PAGE_SIZE = 20;

/**
 * Encodes a cursor from a notification ID and timestamp.
 * Cursor is base64-encoded for transport.
 */
function encodeCursor(id: string, timestamp: Date): string {
  const cursorData = `${id}:${timestamp.getTime()}`;
  return Buffer.from(cursorData).toString("base64");
}

/**
 * Decodes a cursor to retrieve the notification ID and timestamp.
 */
function decodeCursor(cursor: string): { id: string; timestamp: number } {
  try {
    const cursorData = Buffer.from(cursor, "base64").toString("utf-8");
    const [id, timestamp] = cursorData.split(":");
    return { id, timestamp: parseInt(timestamp, 10) };
  } catch {
    throw new Error("Invalid cursor format");
  }
}

/**
 * Fetches paginated notifications for a user using cursor-based pagination.
 * Returns notifications in reverse chronological order (newest first).
 * Issue #1653
 */
export async function getNotificationsPaginated(
  userId: string,
  cursor?: string,
  limit: number = DEFAULT_PAGE_SIZE,
): Promise<PaginatedNotifications> {
  logger.info({ userId, cursor, limit }, "Fetching paginated notifications");

  // Verify user exists
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw new NotFoundError(`User ${userId} not found`);

  let cursorFilter: { createdAt?: { lt: Date }; id?: { not: string } } = {};

  // If cursor provided, decode it and use it as the starting point
  if (cursor) {
    try {
      const { id: cursorId, timestamp } = decodeCursor(cursor);
      cursorFilter = {
        createdAt: { lt: new Date(timestamp) },
        id: { not: cursorId },
      };
    } catch (err) {
      logger.warn({ cursor, error: err }, "Failed to decode cursor, ignoring");
    }
  }

  // Fetch one extra item to determine if there are more results
  const notifications = await prisma.notification.findMany({
    where: {
      userId,
      ...cursorFilter,
    },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: limit + 1,
  });

  logger.info(
    { userId, fetchedCount: notifications.length, limit },
    "Notifications fetched"
  );

  // Check if there are more results
  const hasMore = notifications.length > limit;
  const items = hasMore ? notifications.slice(0, limit) : notifications;

  // Generate next cursor from the last item
  let nextCursor: string | null = null;
  if (hasMore && items.length > 0) {
    const lastItem = items[items.length - 1];
    nextCursor = encodeCursor(lastItem.id, lastItem.createdAt);
  }

  return {
    items: items.map((n) => ({
      id: n.id,
      userId: n.userId,
      type: n.type,
      payload: n.payload as Record<string, unknown>,
      readAt: n.readAt,
      createdAt: n.createdAt,
    })),
    cursor: nextCursor,
    hasMore,
  };
}

/**
 * Marks a notification as read.
 */
export async function markNotificationAsRead(
  notificationId: string,
  userId: string,
): Promise<void> {
  logger.info({ notificationId, userId }, "Marking notification as read");

  const notification = await prisma.notification.findUnique({
    where: { id: notificationId },
  });

  if (!notification) {
    throw new NotFoundError(`Notification ${notificationId} not found`);
  }

  if (notification.userId !== userId) {
    throw new Error("Not authorized to modify this notification");
  }

  await prisma.notification.update({
    where: { id: notificationId },
    data: { readAt: new Date() },
  });

  logger.info({ notificationId, userId }, "Notification marked as read");
}

/**
 * Marks all notifications as read for a user.
 */
export async function markAllNotificationsAsRead(userId: string): Promise<number> {
  logger.info({ userId }, "Marking all notifications as read");

  const result = await prisma.notification.updateMany({
    where: { userId, readAt: null },
    data: { readAt: new Date() },
  });

  logger.info({ userId, count: result.count }, "All notifications marked as read");
  return result.count;
}
