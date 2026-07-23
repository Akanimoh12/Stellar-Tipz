import type { Request, Response, NextFunction } from 'express';
import { userIdParamSchema, recalculateSchema, creditHistoryQuerySchema } from './credit.schema.js';
import * as creditService from './credit.service.js';

export async function getCreditScore(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { userId } = userIdParamSchema.parse(req.params);
    const result = await creditService.getCreditScore(userId);
    res.status(200).json({ data: result });
  } catch (err) {
    next(err);
  }
}

export async function getCreditScoreHistory(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { userId } = userIdParamSchema.parse(req.params);
    const { limit, offset } = creditHistoryQuerySchema.parse(req.query);
    const result = await creditService.getCreditScoreHistory(userId, limit, offset);
    res.status(200).json({ data: result });
  } catch (err) {
    next(err);
  }
}

export async function recalculate(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { userId } = recalculateSchema.parse(req.body);
    const result = await creditService.recalculateCreditScore(userId);
    res.status(200).json({ data: result });
  } catch (err) {
    next(err);
  }
}
