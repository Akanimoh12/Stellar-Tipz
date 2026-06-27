import type { NextFunction, Request, Response } from 'express';
import { ZodError } from 'zod';
import { AppError } from '../errors/AppError.js';
import { logger } from '../utils/logger.js';

/** Stringifies the correlation id set by the requestId middleware, if present. */
function requestIdOf(req: Request): string | undefined {
  return req.id === undefined ? undefined : String(req.id);
}

/** 404 fallthrough for unmatched routes. */
export function notFoundHandler(req: Request, res: Response): void {
  res.status(404).json({
    error: { code: 'NOT_FOUND', message: 'Route not found', requestId: requestIdOf(req) },
  });
}

/** Global error handler. Must be registered LAST, after all routes. */
export function errorHandler(
  err: unknown,
  req: Request,
  res: Response,
  _next: NextFunction,
): void {
  const requestId = requestIdOf(req);
  if (err instanceof ZodError) {
    res.status(400).json({
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Invalid request',
        details: err.flatten(),
        requestId,
      },
    });
    return;
  }
  if (err instanceof AppError) {
    res.status(err.statusCode).json({
      error: { code: err.code, message: err.message, details: err.details, requestId },
    });
    return;
  }
  logger.error({ err, requestId }, 'Unhandled error');
  res
    .status(500)
    .json({ error: { code: 'INTERNAL_ERROR', message: 'Something went wrong', requestId } });
}
