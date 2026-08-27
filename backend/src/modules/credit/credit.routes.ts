import { Router } from 'express';
import * as creditController from './credit.controller.js';
import { requireAuth } from '../auth/auth.middleware.js';

export const creditRouter = Router();

creditRouter.get('/:userId/history', creditController.getCreditScoreHistory);
creditRouter.post('/recalculate', requireAuth, creditController.recalculate);
creditRouter.get('/:identifier', creditController.getCreditScore);
