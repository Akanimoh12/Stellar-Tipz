import type { Prisma } from '@prisma/client';
import { prisma } from '../../db/prisma.js';
import { NotFoundError } from '../../common/errors/AppError.js';
import { emitNotificationCreated } from '../../realtime/index.js';
import type { UpdateNotificationPreferencesInput } from './notifications.schema.js';
import type {
  NotificationListResponse,
  NotificationPreferenceResponse,
  NotificationResponse,
  NotificationType,
  UnreadCountResponse,
} from './notifications.types.js';

/** Maps a notification type to the preference field gating its delivery. */
const PREFERENCE_FIELD_BY_TYPE: Record<
  NotificationType,
  'tipReceived' | 'goalReached' | 'subscriptionCharged'
> = {
  tip_received: 'tipReceived',
  goal_reached: 'goalReached',
  subscription_charged: 'subscriptionCharged',
};

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

/** GET /notifications/unread-count — count of unread, non-deleted notifications. */
export async function getUnreadCount(userId: string): Promise<UnreadCountResponse> {
  const count = await prisma.notification.count({
    where: { userId, readAt: null, deletedAt: null },
  });

  return { count };
}

function formatPreferences(pref: {
  tipReceived: boolean;
  goalReached: boolean;
  subscriptionCharged: boolean;
  updatedAt: Date;
}): NotificationPreferenceResponse {
  return {
    tipReceived: pref.tipReceived,
    goalReached: pref.goalReached,
    subscriptionCharged: pref.subscriptionCharged,
    updatedAt: pref.updatedAt.toISOString(),
  };
}

/** GET /notifications/preferences — defaults to all-enabled when no row exists yet. */
export async function getPreferences(userId: string): Promise<NotificationPreferenceResponse> {
  const pref = await prisma.notificationPreference.findUnique({ where: { userId } });
  if (!pref) {
    return {
      tipReceived: true,
      goalReached: true,
      subscriptionCharged: true,
      updatedAt: new Date(0).toISOString(),
    };
  }
  return formatPreferences(pref);
}

/** PATCH /notifications/preferences — upserts the caller's preference row. */
export async function updatePreferences(
  userId: string,
  patch: UpdateNotificationPreferencesInput,
): Promise<NotificationPreferenceResponse> {
  const pref = await prisma.notificationPreference.upsert({
    where: { userId },
    create: { userId, ...patch },
    update: patch,
  });
  return formatPreferences(pref);
}

/**
 * Create a notification for a user and broadcast it over the realtime gateway,
 * unless the user has disabled this notification type in their preferences.
 * Used by the tip and goal modules to notify creators of relevant events.
 */
export async function createNotification(
  userId: string,
  type: NotificationType,
  payload: Record<string, unknown>,
): Promise<NotificationResponse | null> {
  const preferenceField = PREFERENCE_FIELD_BY_TYPE[type];
  const pref = await prisma.notificationPreference.findUnique({ where: { userId } });
  if (pref && !pref[preferenceField]) {
    return null;
  }

  const notification = await prisma.notification.create({
    data: { userId, type, payload: payload as Prisma.InputJsonValue },
  });

  const formatted = formatNotification(notification);
  emitNotificationCreated({
    id: formatted.id,
    userId,
    type: formatted.type,
    payload: formatted.payload,
    createdAt: formatted.createdAt,
  });

  return formatted;
}
