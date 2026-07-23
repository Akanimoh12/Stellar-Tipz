import type { Request, Response, NextFunction } from 'express';
import { withdrawalHistoryQuerySchema } from './withdrawals.schema.js';
import * as withdrawalsService from './withdrawals.service.js';

/** GET /withdrawals/me — withdrawal history for the authenticated user. */
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
