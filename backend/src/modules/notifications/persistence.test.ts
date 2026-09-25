import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

vi.mock('../../db/prisma.js', async () => {
  const { PrismaClient } = await import('@prisma/client');
  return {
    prisma: new PrismaClient({
      datasources: {
        db: {
          url: process.env.TEST_NOTIFICATION_DATABASE_URL ?? process.env.DATABASE_URL,
        },
      },
    }),
  };
});
vi.mock('../../realtime/index.js', () => ({ emitNotificationCreated: vi.fn() }));
import { prisma } from '../../db/prisma.js';
import { enqueueTipBatch, flushNotificationBatches } from './batching.js';
import { queueDelivery, transitionDelivery, acknowledgeDeliverySent } from './delivery.js';
import { persistNotification } from './notifications.service.js';

// Apply the migration to an isolated PostgreSQL database, then opt in explicitly.
describe.skipIf(!process.env.TEST_NOTIFICATION_DATABASE_URL)(
  'notification PostgreSQL persistence',
  () => {
    const userId = randomUUID();
    beforeAll(async () => {
      await prisma.user.create({ data: { id: userId, stellarAddress: `G${randomUUID()}` } });
      await prisma.notificationPreference.create({ data: { userId, batchingEnabled: true } });
    });
    afterAll(async () => {
      await prisma.notification.deleteMany({ where: { userId } });
      await prisma.user.delete({ where: { id: userId } });
      await prisma.$disconnect();
    });
    it('atomically aggregates concurrent tips and flushes once across competing workers', async () => {
      const start = new Date('2026-01-01T00:00:00Z');
      await Promise.all(
        Array.from({ length: 12 }, () =>
          enqueueTipBatch(userId, { amountStroops: '37500000' }, 60, start),
        ),
      );
      expect(await prisma.notificationBatch.findFirst({ where: { userId } })).toMatchObject({
        count: 12,
        totalStroops: 450000000n,
      });
      expect(await flushNotificationBatches(start)).toBe(0);
      await Promise.all([
        flushNotificationBatches(new Date(start.getTime() + 60000)),
        flushNotificationBatches(new Date(start.getTime() + 60000)),
      ]);
      const digests = await prisma.notification.findMany({ where: { userId, type: 'tip_digest' } });
      expect(digests).toHaveLength(1);
      expect(digests[0].payload).toMatchObject({
        count: 12,
        summary: '12 new tips totalling 45 XLM',
      });
      expect(await prisma.notificationBatch.count({ where: { userId } })).toBe(0);
    });
    it('rolls a queued tip back with the caller transaction', async () => {
      await expect(
        prisma.$transaction(async (tx) => {
          await persistNotification(tx, userId, 'tip_received', { amountStroops: '100' });
          throw new Error('tip transaction rolled back');
        }),
      ).rejects.toThrow('rolled back');
      expect(await prisma.notificationBatch.count({ where: { userId } })).toBe(0);
    });
    it('persists bounce suppression and a single fallback notification across duplicate receipts', async () => {
      const delivery = await queueDelivery(userId, 'email');
      await transitionDelivery(delivery.id, 'sent');
      await transitionDelivery(delivery.id, 'bounced', 'Hard bounce: unknown mailbox');
      await transitionDelivery(delivery.id, 'bounced', 'Hard bounce: unknown mailbox');
      await acknowledgeDeliverySent(delivery.id);
    await expect(queueDelivery(userId, 'email')).rejects.toThrow('channel is disabled');
      expect(
        await prisma.notification.count({
          where: { userId, type: 'notification_channel_disabled' },
        }),
      ).toBe(1);
      expect(
        await prisma.notificationDelivery.findUnique({ where: { id: delivery.id } }),
      ).toMatchObject({ status: 'bounced', reason: 'Hard bounce: unknown mailbox' });
    });
  },
);
