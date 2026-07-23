import type { Request, Response, NextFunction } from 'express';
import { leaderboardQuerySchema, userIdParamSchema } from './leaderboard.schema.js';
import * as leaderboardService from './leaderboard.service.js';

export async function getLeaderboard(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { period, limit, offset } = leaderboardQuerySchema.parse(req.query);
    const result = await leaderboardService.getLeaderboard(period, limit, offset);
    res.status(200).json(result);
  } catch (err) {
    next(err);
  }
}

export async function getUserRank(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { userId } = userIdParamSchema.parse(req.params);
    const period = (req.query.period as 'WEEKLY' | 'MONTHLY' | 'ALL_TIME') || 'ALL_TIME';
    const result = await leaderboardService.getUserRank(userId, period);
    res.status(200).json({ data: result });
  } catch (err) {
    next(err);
  }
}
