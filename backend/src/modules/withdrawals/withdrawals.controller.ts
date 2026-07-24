import type { Request, Response, NextFunction } from 'express';
import { withdrawalHistoryQuerySchema, prepareWithdrawalSchema } from './withdrawals.schema.js';
import * as withdrawalsService from './withdrawals.service.js';

/** GET /withdrawals/me: withdrawal history for the authenticated user. */
export async function getMyWithdrawals(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { limit, offset } = withdrawalHistoryQuerySchema.parse(req.query);
    const result = await withdrawalsService.getWithdrawalHistory(req.user!.id, limit, offset);
    res.status(200).json({ data: result });
  } catch (err) {
    next(err);
  }
}

/** GET /balances/me: withdrawable balance for the authenticated user. */
export async function getMyBalance(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const result = await withdrawalsService.getWithdrawableBalance(req.user!.id);
    res.status(200).json({ data: result });
  } catch (err) {
    next(err);
  }
}

/** POST /withdrawals/prepare: build an unsigned withdrawal transaction. */
export async function prepareWithdrawal(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { amount } = prepareWithdrawalSchema.parse(req.body);
    const result = await withdrawalsService.prepareWithdrawal(req.user!.id, amount);
    res.status(200).json({ data: result });
  } catch (err) {
    next(err);
  }
}
