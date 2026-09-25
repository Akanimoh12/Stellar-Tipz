import type { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { payoutScheduleSchema } from './payouts.schema.js';
import {
  getPayoutSchedule,
  upsertPayoutSchedule,
} from './payouts.service.js';
import { BadRequestError, UnauthorizedError } from '../../common/errors/AppError.js';

function currentUserId(req: Request): string {
  const user = (req as unknown as { user?: { id: string } }).user;
  if (!user?.id) throw new UnauthorizedError('Authentication required');
  return user.id;
}

export async function getMyPayoutSchedule(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const userId = currentUserId(req);
    const schedule = await getPayoutSchedule(userId);
    res.status(200).json({ data: schedule ?? null });
  } catch (err) {
    next(err);
  }
}

export async function updateMyPayoutSchedule(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const userId = currentUserId(req);
    const input = payoutScheduleSchema.parse(req.body);
    const schedule = await upsertPayoutSchedule(userId, input);
    res.status(200).json({ data: schedule });
  } catch (err) {
    if (err instanceof z.ZodError) {
      next(new BadRequestError('Invalid payout schedule input'));
      return;
    }
    next(err);
  }
}
