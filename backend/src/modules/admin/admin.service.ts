import type { Prisma } from '@prisma/client';
import { prisma } from '../../db/prisma.js';
import { logger } from '../../common/utils/logger.js';
import type { AuditLogEntry, PlatformStats } from './admin.types.js';

/** How many days back `activeUsersLast30Days` looks. */
const ACTIVE_WINDOW_DAYS = 30;
const ACTIVE_WINDOW_MS = ACTIVE_WINDOW_DAYS * 24 * 60 * 60 * 1000;

/** Maps a persisted audit row onto the DTO returned by the API. */
function toAuditLogEntry(log: {
  id: string;
  actor: string;
  action: string;
  target: string | null;
  metadata: Prisma.JsonValue;
  createdAt: Date;
}): AuditLogEntry {
  return {
    id: log.id,
    actor: log.actor,
    action: log.action,
    target: log.target,
    metadata: (log.metadata as Record<string, unknown> | null) ?? {},
    createdAt: log.createdAt,
  };
}

/**
 * Records an admin action in the audit trail.
 *
 * @param actor - Id of the admin (or "system") performing the action.
 * @param action - Machine-readable action name, e.g. "admin.user.ban".
 * @param target - Id of the entity acted on, when applicable.
 * @param metadata - Structured context (before/after values, reason…).
 */
export async function logAuditAction(
  actor: string,
  action: string,
  target: string | null = null,
  metadata: Record<string, unknown> = {},
): Promise<AuditLogEntry> {
  logger.info({ actor, action, target, metadata }, 'Admin action logged');

  const auditLog = await prisma.auditLog.create({
    data: {
      actor,
      action,
      target,
      metadata: metadata as Prisma.InputJsonValue,
    },
  });

  return toAuditLogEntry(auditLog);
}

/**
 * Lists audit logs newest-first, optionally filtered by action and/or actor.
 */
export async function listAuditLogs(
  limit: number,
  offset: number,
  action?: string,
  actor?: string,
): Promise<AuditLogEntry[]> {
  const where: Prisma.AuditLogWhereInput = {};
  if (action) where.action = action;
  if (actor) where.actor = actor;

  const logs = await prisma.auditLog.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    skip: offset,
    take: limit,
  });

  return logs.map(toAuditLogEntry);
}

/**
 * Aggregates platform-wide statistics for the admin dashboard.
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
        createdAt: { gte: new Date(Date.now() - ACTIVE_WINDOW_MS) },
      },
    }),
    prisma.subscription.count({ where: { deletedAt: null } }),
    prisma.refund.count(),
  ]);

  const totalTipAmount = totalTipAmountResult._sum.amountStroops ?? BigInt(0);
  const averageTipAmount =
    totalTips > 0 ? (totalTipAmount / BigInt(totalTips)).toString() : '0';

  return {
    totalUsers,
    totalCreators,
    totalTips,
    totalTipAmountStroops: totalTipAmount,
    activeUsersLast30Days,
    totalSubscriptions,
    totalRefunds,
    averageTipAmount,
  };
}
