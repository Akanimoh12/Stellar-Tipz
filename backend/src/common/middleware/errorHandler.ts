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

  // Multer errors (file size/count) — return 413 in app error format, not HTML
  const multerErr = err as { code?: string; status?: number; type?: string; limit?: string };
  if (multerErr?.code === 'LIMIT_FILE_SIZE' || multerErr?.code === 'LIMIT_FILE_COUNT' || multerErr?.code === 'LIMIT_FIELD_COUNT' || multerErr?.code === 'LIMIT_UNEXPECTED_FILE') {
    res.status(413).json({
      error: { code: 'PAYLOAD_TOO_LARGE', message: 'Payload too large', details: { limit: multerErr.code }, requestId },
    });
    return;
  }

  // Express json entity.too.large (body > limit) — also 413 with JSON envelope
  if (
    (err as { type?: string; status?: number })?.type === 'entity.too.large' ||
    (err as { status?: number })?.status === 413 ||
    (err as { statusCode?: number })?.statusCode === 413
  ) {
    res.status(413).json({
      error: { code: 'PAYLOAD_TOO_LARGE', message: 'Payload too large', requestId },
    });
    return;
  }

  // TimeoutError from AbortSignal.timeout (upstream) mapped to 503/504? unify to 503 REQUEST_TIMEOUT
  if (err instanceof DOMException && err.name === 'TimeoutError') {
    res.status(503).json({
      error: { code: 'REQUEST_TIMEOUT', message: err.message || 'Upstream request timed out', requestId },
    });
    return;
  }
  if (err instanceof DOMException && err.name === 'AbortError') {
    // Client disconnect abort — if headers already sent, ignore; otherwise map to 499 or 503
    if (res.headersSent) return;
    // If request was aborted by server timeout, upstream already responded 503; avoid double response
    if ((req as unknown as { signal?: AbortSignal })?.signal?.aborted) {
      // If client disconnected, log and return 503 with cancellation code
      res.status(503).json({
        error: { code: 'REQUEST_CANCELLED', message: 'Request cancelled', requestId },
      });
      return;
    }
  }

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
