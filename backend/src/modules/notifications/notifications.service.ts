import { BATCHABLE, NEVER_BATCH, enqueueTipBatch } from './batching.js';
import type { Prisma, Notification } from '@prisma/client';
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
import {
  createCursorScope,
  descendingCursorCondition,
  toCursorPage,
} from '../../common/pagination/cursor.js';

/** Maps a notification type to the preference field gating its delivery. */
const PREFERENCE_FIELD_BY_TYPE: Partial<
  Record<NotificationType, 'tipReceived' | 'goalReached' | 'subscriptionCharged' | 'payoutFailed'>
> = {
  tip_received: 'tipReceived',
  goal_reached: 'goalReached',
  subscription_charged: 'subscriptionCharged',
  payout_failed: 'payoutFailed',
};

function formatNotification(n: {
  id: string
  type: string
  payload: unknown
  readAt: Date | null
  createdAt: Date
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
  cursor?: string,
  offset?: number,
): Promise<NotificationListResponse> {
  const baseWhere: Prisma.NotificationWhereInput = {
    userId,
    deletedAt: null,
    ...(unreadOnly ? { readAt: null } : {}),
  };
  const scope = createCursorScope('notifications', { userId, unreadOnly });
  const cursorCondition = descendingCursorCondition('createdAt', cursor, scope);
  const where: Prisma.NotificationWhereInput = cursorCondition
    ? { AND: [baseWhere, cursorCondition as Prisma.NotificationWhereInput] }
    : baseWhere;
  const rows = await prisma.notification.findMany({
    where,
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    ...(offset !== undefined ? { skip: offset } : {}),
    take: limit + 1,
  });
  const page = toCursorPage(rows, limit, scope, (notification) => notification.createdAt);

  return {
    data: page.data.map(formatNotification),
    nextCursor: page.nextCursor,
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
  tipReceived: boolean
  goalReached: boolean
  subscriptionCharged: boolean
  batchingEnabled: boolean
  batchingWindowSeconds: number
  updatedAt: Date
}): NotificationPreferenceResponse {
  return {
    tipReceived: pref.tipReceived,
    goalReached: pref.goalReached,
    subscriptionCharged: pref.subscriptionCharged,
    batchingEnabled: pref.batchingEnabled,
    batchingWindowSeconds: pref.batchingWindowSeconds,
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
      batchingEnabled: false,
      batchingWindowSeconds: 300,
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
    create: {
      userId,
      tipReceived: patch.tipReceived,
      goalReached: patch.goalReached,
      subscriptionCharged: patch.subscriptionCharged,
      batchingEnabled: patch.batchingEnabled,
      batchingWindowSeconds: patch.batchingWindowSeconds,
    },
    update: {
      tipReceived: patch.tipReceived,
      goalReached: patch.goalReached,
      subscriptionCharged: patch.subscriptionCharged,
      batchingEnabled: patch.batchingEnabled,
      batchingWindowSeconds: patch.batchingWindowSeconds,
    },
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
  const notification = await persistNotification(prisma, userId, type, payload);
  if (!notification) return null;

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

/** Persist notification or digest in the caller's transaction; publish only after commit. */
export async function persistNotification(
  tx: Pick<
    Prisma.TransactionClient,
    'notificationPreference' | 'notificationBatch' | 'notification'
  >,
  userId: string,
  type: NotificationType,
  payload: Record<string, unknown>,
): Promise<Notification | null> {
  const preferenceField = PREFERENCE_FIELD_BY_TYPE[type];
  const pref = await tx.notificationPreference.findUnique({ where: { userId } });
  if (!NEVER_BATCH.has(type) && pref && preferenceField && !pref[preferenceField]) {
    return null;
  }

  if (!NEVER_BATCH.has(type) && BATCHABLE.has(type) && pref?.batchingEnabled) {
    await enqueueTipBatch(userId, payload, pref.batchingWindowSeconds, new Date(), tx);
    return null;
  }

  return tx.notification.create({
    data: {
      userId,
      type,
      payload: payload as Prisma.InputJsonValue,
      deliveries: { create: { userId, channel: 'in_app', status: 'delivered' } },
    },
  });
}
