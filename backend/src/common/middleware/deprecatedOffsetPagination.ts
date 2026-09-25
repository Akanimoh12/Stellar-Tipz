import type { NextFunction, Request, Response } from 'express';
import { env } from '../../config/env.js';
import { logger } from '../utils/logger.js';

const OFFSET_DEPRECATION_DATE = new Date('2026-08-26T00:00:00.000Z');
const OFFSET_SUNSET_DATE = new Date('2027-02-28T00:00:00.000Z');

/** Signals and records use of the temporarily supported offset query parameter. */
export function deprecatedOffsetPagination(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  if (req.query.offset !== undefined) {
    res.setHeader('Deprecation', `@${Math.floor(OFFSET_DEPRECATION_DATE.getTime() / 1_000)}`);
    res.setHeader('Sunset', OFFSET_SUNSET_DATE.toUTCString());
    res.append('Link', `<${env.API_BASE_PATH}/docs>; rel="deprecation"`);
    logger.warn(
      {
        event: 'deprecated_offset_pagination_used',
        method: req.method,
        path: req.originalUrl,
        requestId: req.id,
        userId: req.user?.id ?? req.auth?.userId,
      },
      'Deprecated offset pagination used',
    );
  }

  next();
}
