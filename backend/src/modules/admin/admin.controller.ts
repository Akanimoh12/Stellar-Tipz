import type { Request, Response } from 'express';
import { BadRequestError } from '../../common/errors/AppError.js';
import {
  createAuditLogSchema,
  listAuditLogsQuerySchema,
  platformStatsResponseSchema,
} from './admin.schema.js';
import {
  logAuditAction,
  listAuditLogs,
  getPlatformStats,
} from './admin.service.js';

/**
 * GET /admin/audit-logs — list audit logs with optional filtering.
 */
export async function listAuditLogsController(
  req: Request,
  res: Response,
): Promise<void> {
  const parsed = listAuditLogsQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    throw new BadRequestError('Invalid query parameters');
  }

  const { limit, offset, action, actor } = parsed.data;
  const logs = await listAuditLogs(limit, offset, action, actor);

  res.json({ data: logs });
}

/**
 * GET /admin/stats — get platform statistics.
 */
export async function getPlatformStatsController(
  _req: Request,
  res: Response,
): Promise<void> {
  const stats = await getPlatformStats();

  const response = {
    ...stats,
    totalTipAmountStroops: stats.totalTipAmountStroops.toString(),
  };

  const validated = platformStatsResponseSchema.parse(response);
  res.json({ data: validated });
}

/**
 * POST /admin/audit-log — create an audit log entry (internal use).
 */
export async function createAuditLogController(
  req: Request,
  res: Response,
): Promise<void> {
  const auth = req.auth;
  if (!auth) {
    throw new BadRequestError('Unauthorized');
  }

  const parsed = createAuditLogSchema.safeParse(req.body);
  if (!parsed.success) {
    throw new BadRequestError('Invalid audit log payload', parsed.error.issues);
  }
  const { action, target, metadata } = parsed.data;

  const log = await logAuditAction(
    auth.sub,
    action,
    target,
    metadata,
  );

  res.status(201).json({ data: log });
}
