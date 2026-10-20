import type { NextFunction, Request, Response } from 'express';
import { UnauthorizedError } from '../../common/errors/AppError.js';
import { logger } from '../../common/utils/logger.js';
import { logAuditAction } from './admin.service.js';

/** The role every route in this module is gated behind. */
export const ADMIN_ROLE = 'admin';

/**
 * Resolves the id of the admin performing the request.
 *
 * `requireAuth` from the auth module stores the verified access-token payload
 * on `req.auth` (whose subject field is `userId`); the older shared
 * `requireAuth` middleware populates `req.user` instead, so both are accepted.
 *
 * @throws UnauthorizedError when neither is present.
 */
export function resolveAdminActor(req: Request): string {
  const actorId = req.auth?.userId ?? req.user?.id;
  if (!actorId) {
    throw new UnauthorizedError('Authentication required');
  }
  return actorId;
}

/**
 * Records a successful admin request in the audit trail.
 *
 * The write happens once the response has been flushed, so auditing never
 * delays the request and a failed audit write can never turn a successful
 * admin action into a 500 — failures are logged instead. Requests that ended
 * in an error (4xx/5xx, including the 403 from the role guard) are skipped:
 * they never changed anything.
 *
 * @param action - Machine-readable action name stored on the audit entry.
 */
export function auditAdminAction(action: string) {
  return (req: Request, res: Response, next: NextFunction): void => {
    res.on('finish', () => {
      if (res.statusCode >= 400) return;

      const actorId = req.auth?.userId ?? req.user?.id;
      if (!actorId) return;

      void logAuditAction(actorId, action, null, {
        method: req.method,
        path: req.originalUrl,
        statusCode: res.statusCode,
      }).catch((err: unknown) => {
        logger.error({ err, action, actorId }, 'Failed to write admin audit log');
      });
    });

    next();
  };
}
