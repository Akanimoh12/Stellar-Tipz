import { Router } from 'express';
import * as withdrawalsController from './withdrawals.controller.js';
import { requireAuth } from '../../common/middleware/requireAuth.js';

export const withdrawalsRouter = Router();

withdrawalsRouter.get('/me', requireAuth, withdrawalsController.getMyWithdrawals);
