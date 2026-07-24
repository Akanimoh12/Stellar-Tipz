import { Router } from "express";
import { requireAuth } from "../auth/auth.middleware.js";
import {
  createWithdrawalController,
  getWithdrawalController,
  listWithdrawalsController,
} from "./withdrawals.controller.js";

/**
 * Withdrawals module router.
 * Mounted at /api/v1/withdrawals in app.ts. All routes require authentication.
 */
export const withdrawalsRouter = Router();

withdrawalsRouter.use(requireAuth);

withdrawalsRouter.post("/", createWithdrawalController);
withdrawalsRouter.get("/", listWithdrawalsController);
withdrawalsRouter.get("/:id", getWithdrawalController);
import { Router } from 'express';
import * as withdrawalsController from './withdrawals.controller.js';
import { requireAuth } from '../../common/middleware/requireAuth.js';

export const withdrawalsRouter = Router();

withdrawalsRouter.get('/me', requireAuth, withdrawalsController.getMyWithdrawals);
withdrawalsRouter.post('/prepare', requireAuth, withdrawalsController.prepareWithdrawal);

export const balancesRouter = Router();
balancesRouter.get('/me', requireAuth, withdrawalsController.getMyBalance);
