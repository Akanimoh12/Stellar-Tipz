import type { NotificationChannel, NotificationDeliveryStatus } from '@prisma/client';
import { prisma } from '../../db/prisma.js';
import { BadRequestError, NotFoundError } from '../../common/errors/AppError.js';

const TRANSITIONS: Record<NotificationDeliveryStatus, NotificationDeliveryStatus[]> = {
  queued: ['sent', 'delivered', 'failed', 'bounced'],
  sent: ['delivered', 'failed', 'bounced'],
  delivered: ['bounced'],
  failed: ['bounced'],
  bounced: [],
};

/** Begin a tracked channel attempt, refusing suppressed channels. */
export async function queueDelivery(
  userId: string,
  channel: NotificationChannel,
  notificationId?: string,
) {
  const state = await prisma.notificationChannelState.findUnique({
    where: { userId_channel: { userId, channel } },
  });
  if (state?.disabledAt)
    throw new BadRequestError('Notification channel is disabled after delivery failures');
  return prisma.notificationDelivery.create({ data: { userId, channel, notificationId } });
}

/** Apply provider receipts idempotently; hard bounces suppress the channel immediately. */
export async function transitionDelivery(
  id: string,
  status: NotificationDeliveryStatus,
  reason?: string,
) {
  if ((status === 'failed' || status === 'bounced') && !reason?.trim()) {
    throw new BadRequestError('A failure reason is required');
  }
  return prisma.$transaction(async (tx) => {
    const delivery = await tx.notificationDelivery.findUnique({ where: { id } });
    if (!delivery) throw new NotFoundError('Delivery not found');
    if (delivery.status === status) return delivery;
    if (!TRANSITIONS[delivery.status].includes(status))
      throw new BadRequestError('Invalid delivery status transition');
    const updated = await tx.notificationDelivery.updateMany({
      where: { id, status: delivery.status },
      data: { status, reason: reason ?? null },
    });
    if (!updated.count) throw new BadRequestError('Delivery changed; retry receipt');
    const failed = status === 'failed' || status === 'bounced';
    if (failed || status === 'delivered') {
      const key = { userId: delivery.userId, channel: delivery.channel };
      const state = await tx.notificationChannelState.upsert({
        where: { userId_channel: key },
        create: { ...key, consecutiveFailures: failed ? 1 : 0 },
        update: { consecutiveFailures: failed ? { increment: 1 } : 0 },
      });
      if (
        delivery.channel !== 'in_app' &&
        (status === 'bounced' || state.consecutiveFailures >= 3)
      ) {
        const disabled = await tx.notificationChannelState.updateMany({
          where: { ...key, disabledAt: null },
          data: { disabledAt: new Date() },
        });
        if (disabled.count)
          await tx.notification.create({
            data: {
              userId: delivery.userId,
              type: 'notification_channel_disabled',
              payload: {
                channel: delivery.channel,
                reason: reason ?? 'Persistent delivery failures',
              },
              deliveries: {
                create: { userId: delivery.userId, channel: 'in_app', status: 'delivered' },
              },
            },
          });
      }
    }
    return { ...delivery, status, reason: reason ?? null };
  });
}

/** Durable per-channel counts and delivery ratios, shared by all processes. */
export async function getDeliveryMetrics() {
  const groups = await prisma.notificationDelivery.groupBy({
    by: ['channel', 'status'],
    _count: true,
  });
  return (['in_app', 'email', 'push'] as const).map((channel) => {
    const counts = Object.fromEntries(
      Object.keys(TRANSITIONS).map((status) => [
        status,
        groups.find((group) => group.channel === channel && group.status === status)?._count ?? 0,
      ]),
    );
    const total = Object.values(counts).reduce((sum, count) => sum + count, 0);
    return { channel, counts, total, deliveryRate: total ? counts.delivered / total : 0 };
  });
}

/** A late transport acknowledgement must not overwrite an earlier provider receipt. */
export async function acknowledgeDeliverySent(id: string): Promise<void> {
  await prisma.notificationDelivery.updateMany({ where: { id, status: 'queued' }, data: { status: 'sent' } });
}
