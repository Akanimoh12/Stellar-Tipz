import * as Sentry from '@sentry/node';
import type { Request, Response, NextFunction, ErrorRequestHandler, RequestHandler } from 'express';
import { env } from '../../config/env.js';
import { logger } from '../utils/logger.js';

export function initSentry() {
  if (!env.SENTRY_DSN) {
    logger.info('Sentry DSN not configured, error tracking disabled');
    return;
  }

  try {
    Sentry.init({
      dsn: env.SENTRY_DSN,
      environment: env.NODE_ENV,
      tracesSampleRate: env.NODE_ENV === 'production' ? 0.1 : 1.0,
      integrations: [
        new Sentry.Integrations.Http({ tracing: true }),
        new Sentry.Integrations.Express({ request: true, serverName: true }),
      ],
    });

    logger.info('Sentry error tracking initialized');
  } catch (error) {
    logger.error({ error }, 'Failed to initialize Sentry');
  }
}

export function getSentryRequestHandler(): RequestHandler {
  if (!env.SENTRY_DSN) {
    return (_req: Request, _res: Response, next: NextFunction) => next();
  }
  return Sentry.Handlers.requestHandler();
}

export function getSentryErrorHandler(): ErrorRequestHandler {
  if (!env.SENTRY_DSN) {
    return (err: unknown, _req: Request, _res: Response, next: NextFunction) => next(err);
  }
  return Sentry.Handlers.errorHandler();
}

export function captureException(error: unknown, context?: Record<string, unknown>) {
  if (!env.SENTRY_DSN) return;

  Sentry.captureException(error, { contexts: { app: context } });
}

export function captureMessage(message: string, level: Sentry.SeverityLevel = 'info') {
  if (!env.SENTRY_DSN) return;

  Sentry.captureMessage(message, level);
}
