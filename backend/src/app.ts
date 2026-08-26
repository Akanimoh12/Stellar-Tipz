import cors from 'cors';
import express, { type Express } from 'express';
import helmet from 'helmet';
import pinoHttp from 'pino-http';
import swaggerUi from 'swagger-ui-express';
import { env } from './config/env.js';
import { errorHandler, notFoundHandler } from './common/middleware/errorHandler.js';
import { globalRateLimiter } from './common/middleware/rateLimiter.js';
import { metricsController, metricsMiddleware } from './common/observability/metrics.js';
import { getSentryRequestHandler, getSentryErrorHandler } from './common/observability/sentry.js';
import { logger } from './common/utils/logger.js';
import { openApiDocument } from './docs/openapi.js';
import { requestId } from './common/middleware/requestId.js';
import { authRouter } from './modules/auth/auth.routes.js';
import { profilesRouter } from './modules/profiles/profiles.routes.js';
import { creditRouter } from './modules/credit/credit.routes.js';
import { leaderboardRouter } from './modules/leaderboard/leaderboard.routes.js';
import { tipsRouter } from './modules/tips/tips.routes.js';
import { balancesRouter, withdrawalsRouter } from './modules/withdrawals/withdrawals.routes.js';
import { ipfsRouter } from './modules/ipfs/ipfs.routes.js';
import { xRouter } from './modules/x/x.routes.js';
import { notificationsRouter } from './modules/notifications/notifications.routes.js';
import { searchRouter } from './modules/search/search.routes.js';
import { webhooksRouter } from './modules/webhooks/webhooks.routes.js';
import { analyticsRouter } from './modules/analytics/analytics.routes.js';
import { goalsRouter } from './modules/goals/goals.routes.js';
import { registerGoalsDocs } from './modules/goals/goals.openapi.js';
import { registerSubscriptionsDocs } from './modules/subscriptions/subscriptions.openapi.js';
import { subscriptionsRouter } from './modules/subscriptions/subscriptions.routes.js';
import { refundsRouter } from './modules/refunds/refunds.routes.js';
import { streaksRouter } from './modules/streaks/streaks.routes.js';
import { adminRouter } from './modules/admin/admin.routes.js';
import { discoveryRouter } from './modules/discovery/discovery.routes.js';
import { statsRouter } from './modules/stats/stats.routes.js';
import { ogRouter } from './modules/og/og.routes.js';

/** Builds and configures the Express application without starting a listener. */
export function createApp(): Express {
  const app = express();

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

  const docsPath = `${env.API_BASE_PATH}/docs`;
  app.get(`${docsPath}/openapi.json`, (_req, res) => {
    res.json(openApiDocument);
  });
  app.use(docsPath, swaggerUi.serve, swaggerUi.setup(openApiDocument));

  app.get('/health', (_req, res) => {
    res.json({
      status: 'ok',
      service: 'stellar-tipz-backend',
      time: new Date().toISOString(),
    });
  });

  app.get('/metrics', metricsController);

  app.use(`${env.API_BASE_PATH}/auth`, authRouter);
  app.use(`${env.API_BASE_PATH}/profiles`, profilesRouter);
  app.use(`${env.API_BASE_PATH}/credit`, creditRouter);
  app.use(`${env.API_BASE_PATH}/leaderboard`, leaderboardRouter);
  app.use(`${env.API_BASE_PATH}/ipfs`, ipfsRouter);
  app.use(`${env.API_BASE_PATH}/tips`, tipsRouter);
  app.use(`${env.API_BASE_PATH}/withdrawals`, withdrawalsRouter);
  app.use(`${env.API_BASE_PATH}/notifications`, notificationsRouter);
  app.use(`${env.API_BASE_PATH}/x`, xRouter);
  app.use(`${env.API_BASE_PATH}/balances`, balancesRouter);
  app.use(`${env.API_BASE_PATH}/search`, searchRouter);
  app.use(`${env.API_BASE_PATH}/webhooks`, webhooksRouter);
  app.use(`${env.API_BASE_PATH}/analytics`, analyticsRouter);
  app.use(`${env.API_BASE_PATH}/goals`, goalsRouter);
  app.use(`${env.API_BASE_PATH}/subscriptions`, subscriptionsRouter);
  app.use(`${env.API_BASE_PATH}/refunds`, refundsRouter);
  app.use(`${env.API_BASE_PATH}/streaks`, streaksRouter);
  app.use(`${env.API_BASE_PATH}/admin`, adminRouter);
  app.use(`${env.API_BASE_PATH}/discover`, discoveryRouter);
  app.use(`${env.API_BASE_PATH}/stats`, statsRouter);
  app.use(`${env.API_BASE_PATH}/og`, ogRouter);

  // Register OpenAPI path docs for feature modules.
  registerGoalsDocs();
  registerSubscriptionsDocs();

  app.use(getSentryErrorHandler());
  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
