import type { NextFunction, Request, Response } from 'express';
import { randomUUID } from 'node:crypto';

/** Header used to carry the correlation id in and out of the service. */
export const REQUEST_ID_HEADER = 'x-request-id';

/**
 * Attaches a unique id to every request for log correlation.
 *
 * Honours an inbound `x-request-id` header when one is supplied (so ids can be
 * propagated across services), otherwise generates a UUID v4. The id is exposed
 * on `req.id` — which pino-http picks up so application logs carry the same id —
 * and echoed back on the response `x-request-id` header. Register this BEFORE
 * `pino-http` so the logger reuses the id instead of generating its own.
 */
export function requestId(req: Request, res: Response, next: NextFunction): void {
  const inbound = req.headers[REQUEST_ID_HEADER];
  const provided = (Array.isArray(inbound) ? inbound[0] : inbound)?.trim();
  const id = provided || randomUUID();

  req.id = id;
  res.setHeader(REQUEST_ID_HEADER, id);
  next();
}
