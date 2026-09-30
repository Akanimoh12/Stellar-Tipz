import type { Prisma } from '@prisma/client';
import { prisma } from '../../db/prisma.js';
import { emitNotificationCreated } from '../../realtime/index.js';

/** Explicit urgent types always bypass batching and optional type preferences. */
export const NEVER_BATCH = new Set(['payout_failed', 'withdrawal_completed', 'security_event']);
export const BATCHABLE = new Set(['tip_received']);

/** Aggregate tips atomically in fixed UTC windows, grouping different assets separately. */
export async function enqueueTipBatch(
  userId: string,
  payload: Record<string, unknown>,
  seconds: number,
  now = new Date(),
  db: Pick<Prisma.TransactionClient, 'notificationBatch'> = prisma,
): Promise<void> {
  const amount = String(payload.amountStroops ?? '0');
  if (!/^\d+$/.test(amount)) throw new Error('Invalid tip amount for digest');
  const tokenCode = typeof payload.tokenCode === 'string' ? payload.tokenCode : 'XLM';
  const dueAt = new Date((Math.floor(now.getTime() / (seconds * 1000)) + 1) * seconds * 1000);
  const id = JSON.stringify([userId, 'tip_received', tokenCode, dueAt.toISOString()]);
  await db.notificationBatch.upsert({
    where: { id },
    create: {
      id,
      userId,
      type: 'tip_received',
      tokenCode,
      dueAt,
      count: 1,
      totalStroops: BigInt(amount),
    },
    update: { count: { increment: 1 }, totalStroops: { increment: BigInt(amount) } },
  });
}

/** Format exact stroops without rounding through floating point. */
export function digestSummary(count: number, total: bigint, token: string): string {
  const fraction = (total % 10_000_000n).toString().padStart(7, '0').replace(/0+$/, '');
  return `${count} new tip${count === 1 ? '' : 's'} totalling ${total / 10_000_000n}${fraction ? `.${fraction}` : ''} ${token}`;
}

/** Flush bounded batches; deleting and creating the durable digest commit together. */
export async function flushNotificationBatches(now = new Date()): Promise<number> {
  const batches = await prisma.notificationBatch.findMany({
    where: { dueAt: { lte: now } },
    orderBy: [{ dueAt: 'asc' }, { id: 'asc' }],
    take: 100,
  });
  let flushed = 0;
  for (const batch of batches) {
    const notification = await prisma
      .$transaction(async (tx) => {
        // DELETE RETURNING locks this batch and returns the latest aggregate, including
        // increments which committed after the candidate query. Another worker gets P2025.
        const claimed = await tx.notificationBatch.delete({ where: { id: batch.id } });
        const preference = await tx.notificationPreference.findUnique({
          where: { userId: batch.userId },
        });
        if (preference?.tipReceived === false) return null;
        return tx.notification.create({
          data: {
            userId: claimed.userId,
            type: 'tip_digest',
            payload: {
              count: claimed.count,
              totalStroops: claimed.totalStroops.toString(),
              tokenCode: claimed.tokenCode,
              summary: digestSummary(claimed.count, claimed.totalStroops, claimed.tokenCode),
            },
            deliveries: {
              create: { userId: claimed.userId, channel: 'in_app', status: 'delivered' },
            },
          },
        });
      })
      .catch((err: unknown) => {
        if (err && typeof err === 'object' && 'code' in err && err.code === 'P2025') return null;
        throw err;
      });
    if (notification) {
      flushed++;
      emitNotificationCreated({ ...notification, createdAt: notification.createdAt.toISOString() });
    }
  }
  return flushed;
}
