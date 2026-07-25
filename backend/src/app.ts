import cors from 'cors';
import express, { type Express } from 'express';
import helmet from 'helmet';
import pinoHttp from 'pino-http';
import swaggerUi from 'swagger-ui-express';
import { env } from './config/env.js';
import {
  errorHandler,
  notFoundHandler,
} from './common/middleware/errorHandler.js';
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

/** Builds and configures the Express application without starting a listener. */
export function createApp(): Express {
  const app = express();

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
  app.use(cors({ origin: env.CORS_ORIGIN.split(','), credentials: true }));
  app.use(requestId);
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

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
