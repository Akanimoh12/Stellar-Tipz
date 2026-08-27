import { prisma } from '../../db/prisma.js';
import { logger } from '../../common/utils/logger.js';
import type { AuditLogEntry, PlatformStats } from './admin.types.js';

/**
 * Log an admin action for audit trail.
 */
export async function logAuditAction(
  actor: string,
  action: string,
  target: string | null = null,
  metadata: Record<string, unknown> = {},
): Promise<AuditLogEntry> {
  logger.info(
    {
      actor,
      action,
      target,
      metadata,
    },
    'Admin action logged',
  );

  const auditLog = await prisma.auditLog.create({
    data: {
      actor,
      action,
      target,
      metadata: metadata as any,
    },
  });

  return {
    id: auditLog.id,
    actor: auditLog.actor,
    action: auditLog.action,
    target: auditLog.target,
    metadata: (auditLog.metadata as Record<string, unknown>) || {},
    createdAt: auditLog.createdAt,
  };
}

/**
 * List audit logs with optional filtering.
 */
export async function listAuditLogs(
  limit: number,
  offset: number,
  action?: string,
  actor?: string,
): Promise<AuditLogEntry[]> {
  const where: any = {};
  if (action) where.action = action;
  if (actor) where.actor = actor;

  const logs = await prisma.auditLog.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    skip: offset,
    take: limit,
  });

  return logs.map((log) => ({
    id: log.id,
    actor: log.actor,
    action: log.action,
    target: log.target,
    metadata: (log.metadata as Record<string, unknown>) || {},
    createdAt: log.createdAt,
  }));
}

/**
 * Get platform-wide statistics for the dashboard.
 */
export async function getPlatformStats(): Promise<PlatformStats> {
  const [
    totalUsers,
    totalCreators,
    totalTips,
    totalTipAmountResult,
    activeUsersLast30Days,
    totalSubscriptions,
    totalRefunds,
  ] = await Promise.all([
    prisma.user.count({ where: { deletedAt: null } }),
    prisma.user.count({
      where: { deletedAt: null, role: { not: 'user' } },
    }),
    prisma.tip.count(),
    prisma.tip.aggregate({
      _sum: { amountStroops: true },
      where: { status: 'CONFIRMED' },
    }),
    prisma.user.count({
      where: {
        deletedAt: null,
        createdAt: {
          gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
        },
      },
    }),
    prisma.subscription.count({ where: { deletedAt: null } }),
    prisma.refund.count(),
  ]);

  const totalTipAmount = totalTipAmountResult._sum.amountStroops || BigInt(0);
  const averageTip =
    totalTips > 0 ? (totalTipAmount / BigInt(totalTips)).toString() : '0';

  return {
    totalUsers,
    totalCreators,
    totalTips,
    totalTipAmountStroops: totalTipAmount,
    activeUsersLast30Days,
    totalSubscriptions,
    totalRefunds,
    averageTipAmount: averageTip,
  };
}
