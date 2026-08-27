import type { Request, Response, NextFunction } from 'express';
import {
  withdrawalHistoryQuerySchema,
  prepareWithdrawalSchema,
  submitWithdrawalSchema,
} from './withdrawals.schema.js';
import * as withdrawalsService from './withdrawals.service.js';

/** GET /withdrawals/me: withdrawal history for the authenticated user. */
export async function getMyWithdrawals(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { limit, cursor, offset } = withdrawalHistoryQuerySchema.parse(req.query);
    const result = await withdrawalsService.getWithdrawalHistory(
      req.user!.id,
      limit,
      cursor,
      offset,
    );
    res.status(200).json(result);
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

/** POST /withdrawals/submit: broadcast a wallet-signed withdrawal transaction. */
export async function submitWithdrawal(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { amount, signedTxXdr } = submitWithdrawalSchema.parse(req.body);
    const result = await withdrawalsService.submitWithdrawal(req.user!.id, amount, signedTxXdr);
    res.status(200).json({ data: result });
  } catch (err) {
    next(err);
  }
}
