import { Router } from 'express';
import { requireAuth } from '../../common/middleware/requireAuth.js';
import * as subscriptionsController from './subscriptions.controller.js';
import { deprecatedOffsetPagination } from '../../common/middleware/deprecatedOffsetPagination.js';

export const subscriptionsRouter = Router();

subscriptionsRouter.get(
  '/me',
  requireAuth,
  deprecatedOffsetPagination,
  subscriptionsController.getMySubscriptions,
);
subscriptionsRouter.post('/prepare', requireAuth, subscriptionsController.prepareCreateSubscription);
subscriptionsRouter.post('/submit', requireAuth, subscriptionsController.submitCreateSubscription);
subscriptionsRouter.post(
  '/prepare-cancel',
  requireAuth,
  subscriptionsController.prepareCancelSubscription,
);
subscriptionsRouter.post(
  '/submit-cancel',
  requireAuth,
  subscriptionsController.submitCancelSubscription,
);
