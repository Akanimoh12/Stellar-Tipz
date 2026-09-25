import type { Prisma } from '@prisma/client';
import { prisma } from '../../db/prisma.js';
import { redis } from '../../db/redis.js';
import { NotFoundError } from '../../common/errors/AppError.js';

type SerializableRecord = Record<string, unknown>;

function toPortableJson(value: unknown): unknown {
  if (typeof value === 'bigint') {
    return value.toString();
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  if (Array.isArray(value)) {
    return value.map(toPortableJson);
  }

  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as SerializableRecord).map(([key, item]) => [
        key,
        toPortableJson(item),
      ]),
    );
  }

  return value;
}

export async function exportUserData(userId: string): Promise<SerializableRecord> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: {
      sentTips: true,
      receivedTips: true,
      withdrawals: true,
      notifications: true,
      notificationPreference: true,
      goals: true,
      tipperSubscriptions: true,
      creatorSubscriptions: true,
      webhookSubscriptions: true,
      payoutSchedule: true,
      creditScore: true,
      creditScoreHistory: true,
      streak: true,
    },
  });

  if (!user || user.deletedAt) {
    throw new NotFoundError('Account not found');
  }

  await prisma.auditLog.create({
    data: {
      actor: userId,
      action: 'privacy.data_export.generated',
      target: userId,
      metadata: { sections: Object.keys(user) } as Prisma.InputJsonValue,
    },
  });

  return toPortableJson({
    generatedAt: new Date(),
    subject: {
      id: user.id,
      stellarAddress: user.stellarAddress,
    },
    data: user,
  }) as SerializableRecord;
}

export async function deleteAccount(userId: string): Promise<SerializableRecord> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, stellarAddress: true, deletedAt: true },
  });

  if (!user || user.deletedAt) {
    throw new NotFoundError('Account not found');
  }

  const pendingWithdrawals = await prisma.withdrawal.findMany({
    where: { userId, status: 'PENDING' },
    select: { id: true, amount: true, fee: true, txHash: true, requestedAt: true },
    orderBy: { requestedAt: 'asc' },
  });

  const pendingTips = await prisma.tip.findMany({
    where: {
      OR: [{ fromAddress: user.stellarAddress }, { toAddress: user.stellarAddress }],
      status: 'PENDING',
    },
    select: {
      id: true,
      txHash: true,
      fromAddress: true,
      toAddress: true,
      amountStroops: true,
      createdAt: true,
    },
    orderBy: { createdAt: 'asc' },
  });

  const deletedAt = new Date();
  await prisma.$transaction([
    prisma.refreshToken.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: deletedAt },
    }),
    prisma.apiKey.updateMany({
      where: { createdById: userId, deletedAt: null },
      data: { deletedAt },
    }),
    prisma.notification.updateMany({
      where: { userId, deletedAt: null },
      data: { deletedAt },
    }),
    prisma.webhookSubscription.updateMany({
      where: { ownerId: userId, deletedAt: null },
      data: { deletedAt },
    }),
    prisma.user.update({
      where: { id: userId },
      data: { deletedAt, deactivatedAt: deletedAt },
    }),
    prisma.auditLog.create({
      data: {
        actor: userId,
        action: 'privacy.account_deleted',
        target: userId,
        metadata: {
          pendingWithdrawalIds: pendingWithdrawals.map((withdrawal) => withdrawal.id),
          pendingTipIds: pendingTips.map((tip) => tip.id),
        } as Prisma.InputJsonValue,
      },
    }),
  ]);

  await redis.del(`profile:${user.stellarAddress}`);

  return toPortableJson({
    deletedAt,
    reconciliation: {
      pendingWithdrawals,
      pendingTips,
      requiresOnChainFollowUp: pendingWithdrawals.length > 0 || pendingTips.length > 0,
    },
  }) as SerializableRecord;
}
