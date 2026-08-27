import cors from 'cors';
import express, { type Express } from 'express';
import helmet from 'helmet';
import pinoHttp from 'pino-http';
import { env } from './config/env.js';
import { createV1Router } from './api/v1.routes.js';
import { createVersionedApiRouter, parseVersionedApiBasePath } from './api/versioning.js';
import { errorHandler, notFoundHandler } from './common/middleware/errorHandler.js';
import { globalRateLimiter } from './common/middleware/rateLimiter.js';
import { metricsController, metricsMiddleware } from './common/observability/metrics.js';
import { getSentryRequestHandler, getSentryErrorHandler } from './common/observability/sentry.js';
import { logger } from './common/utils/logger.js';
import { requestId } from './common/middleware/requestId.js';
import { healthRouter } from './modules/health/health.routes.js';

/** Builds and configures the Express application without starting a listener. */
export function createApp(): Express {
  const app = express();

  // Probes must remain reachable even when Redis-backed middleware is unavailable.
  app.use('/health', healthRouter);

  app.use(getSentryRequestHandler());
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          ...helmet.contentSecurityPolicy.getDefaultDirectives(),
          'script-src': ["'self'", "'unsafe-inline'"],
          'style-src': ["'self'", "'unsafe-inline'"],
        },
      },
    }),
  );
  app.use(
    cors({
      // env.CORS_ORIGIN is already validated as a list of absolute origins at
      // startup (see config/cors.ts), so a misconfigured origin never reaches
      // request time.
      origin: env.CORS_ORIGIN,
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization', 'x-request-id'],
    }),
  );
  app.use(globalRateLimiter);
  app.use(requestId);
  app.use(metricsMiddleware);
  app.use(express.json({ limit: '1mb' }));
  app.use(pinoHttp({ logger }));

  app.get('/metrics', metricsController);

  const { rootPath, version } = parseVersionedApiBasePath(env.API_BASE_PATH);
  app.use(
    rootPath,
    createVersionedApiRouter([{ version, router: createV1Router() }]),
  );

  app.use(getSentryErrorHandler());
  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
