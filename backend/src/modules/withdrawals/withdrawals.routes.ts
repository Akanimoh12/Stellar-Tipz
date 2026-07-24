import { Router } from 'express';
import { requireAuth } from '../../common/middleware/requireAuth.js';
import * as withdrawalsController from './withdrawals.controller.js';

export const withdrawalsRouter = Router();

withdrawalsRouter.get('/me', requireAuth, withdrawalsController.getMyWithdrawals);
withdrawalsRouter.post('/prepare', requireAuth, withdrawalsController.prepareWithdrawal);

export const balancesRouter = Router();
balancesRouter.get('/me', requireAuth, withdrawalsController.getMyBalance);
