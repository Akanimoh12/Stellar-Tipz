import type { NextFunction, Request, Response } from 'express';
import { resolveAdminActor } from './admin.middleware.js';
import {
  createAuditLogSchema,
  listAuditLogsQuerySchema,
  platformStatsResponseSchema,
} from './admin.schema.js';
import { getPlatformStats, listAuditLogs, logAuditAction } from './admin.service.js';

/**
 * GET /admin/audit-logs — list audit logs with optional filtering.
 */
export async function listAuditLogsController(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { limit, offset, action, actor } = listAuditLogsQuerySchema.parse(req.query);
    const logs = await listAuditLogs(limit, offset, action, actor);

    res.status(200).json({ data: logs });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /admin/stats — platform-wide statistics for the admin dashboard.
 */
export async function getPlatformStatsController(
  _req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const stats = await getPlatformStats();

    // amountStroops is a bigint in the DB and is not JSON-serialisable, so the
    // response carries it as a decimal string.
    const validated = platformStatsResponseSchema.parse({
      ...stats,
      totalTipAmountStroops: stats.totalTipAmountStroops.toString(),
    });

    res.status(200).json({ data: validated });
  } catch (err) {
    next(err);
  }
}

/**
 * POST /admin/audit-log — record an admin action in the audit trail.
 */
export async function createAuditLogController(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const actorId = resolveAdminActor(req);
    const { action, target, metadata } = createAuditLogSchema.parse(req.body);

    const log = await logAuditAction(actorId, action, target ?? null, metadata);

    res.status(201).json({ data: log });
  } catch (err) {
    next(err);
  }
}
