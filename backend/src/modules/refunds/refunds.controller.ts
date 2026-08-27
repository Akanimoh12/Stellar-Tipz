import type { Request, Response, NextFunction } from 'express';
import { refundHistoryQuerySchema, requestRefundSchema } from './refunds.schema.js';
import * as refundsService from './refunds.service.js';

/** POST /refunds/request: request a refund for a tip sent by the authenticated user. */
export async function requestRefund(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { tipTxHash, reason } = requestRefundSchema.parse(req.body);
    const result = await refundsService.requestRefund(req.user!.id, tipTxHash, reason);
    res.status(201).json({ data: result });
  } catch (err) {
    next(err);
  }
}

/** GET /refunds/me: refund history for the authenticated user. */
export async function getMyRefunds(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { limit, cursor, offset } = refundHistoryQuerySchema.parse(req.query);
    const result = await refundsService.getMyRefunds(req.user!.id, limit, cursor, offset);
    res.status(200).json(result);
  } catch (err) {
    next(err);
  }
}
