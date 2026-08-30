import { Router } from 'express';
import swaggerUi from 'swagger-ui-express';
import { openApiDocument } from '../docs/openapi.js';
import { adminRouter } from '../modules/admin/admin.routes.js';
import { analyticsRouter } from '../modules/analytics/analytics.routes.js';
import { apiKeysRouter } from '../modules/apiKeys/apiKeys.routes.js';
import { authRouter } from '../modules/auth/auth.routes.js';
import { creditRouter } from '../modules/credit/credit.routes.js';
import { discoveryRouter } from '../modules/discovery/discovery.routes.js';
import { emailRouter } from '../modules/email/email.routes.js';
import { goalsRouter } from '../modules/goals/goals.routes.js';
import { registerGoalsDocs } from '../modules/goals/goals.openapi.js';
import { ipfsRouter } from '../modules/ipfs/ipfs.routes.js';
import { leaderboardRouter } from '../modules/leaderboard/leaderboard.routes.js';
import { moderationRouter } from '../modules/moderation/moderation.routes.js';
import { notificationsRouter } from '../modules/notifications/notifications.routes.js';
import { ogRouter } from '../modules/og/og.routes.js';
import { privacyRouter } from '../modules/privacy/privacy.routes.js';
import { profilesRouter } from '../modules/profiles/profiles.routes.js';
import { refundsRouter } from '../modules/refunds/refunds.routes.js';
import { searchRouter } from '../modules/search/search.routes.js';
import { statsRouter } from '../modules/stats/stats.routes.js';
import { streaksRouter } from '../modules/streaks/streaks.routes.js';
import { registerSubscriptionsDocs } from '../modules/subscriptions/subscriptions.openapi.js';
import { subscriptionsRouter } from '../modules/subscriptions/subscriptions.routes.js';
import { profileTipsRouter, tipsRouter, userTipsRouter } from '../modules/tips/tips.routes.js';
import { webhooksRouter } from '../modules/webhooks/webhooks.routes.js';
import { balancesRouter, withdrawalsRouter } from '../modules/withdrawals/withdrawals.routes.js';
import { xRouter } from '../modules/x/x.routes.js';

/** Composes every endpoint belonging to API v1 under one independently mountable router. */
export function createV1Router(): Router {
  const router = Router();

  router.get('/docs/openapi.json', (_req, res) => {
    res.json(openApiDocument);
  });
  router.use('/docs', swaggerUi.serve, swaggerUi.setup(openApiDocument));

  router.use('/auth', authRouter);
  router.use('/profiles', profilesRouter);
  router.use('/profiles', profileTipsRouter);
  router.use('/users', userTipsRouter);
  router.use('/credit', creditRouter);
  router.use('/leaderboard', leaderboardRouter);
  router.use('/ipfs', ipfsRouter);
  router.use('/tips', tipsRouter);
  router.use('/withdrawals', withdrawalsRouter);
  router.use('/notifications', notificationsRouter);
  router.use('/email', emailRouter);
  router.use('/privacy', privacyRouter);
  router.use('/moderation', moderationRouter);
  router.use('/x', xRouter);
  router.use('/balances', balancesRouter);
  router.use('/search', searchRouter);
  router.use('/webhooks', webhooksRouter);
  router.use('/analytics', analyticsRouter);
  router.use('/goals', goalsRouter);
  router.use('/subscriptions', subscriptionsRouter);
  router.use('/refunds', refundsRouter);
  router.use('/streaks', streaksRouter);
  router.use('/api-keys', apiKeysRouter);
  router.use('/admin', adminRouter);
  router.use('/discover', discoveryRouter);
  router.use('/stats', statsRouter);
  router.use('/og', ogRouter);

  registerGoalsDocs();
  registerSubscriptionsDocs();

  return router;
}
