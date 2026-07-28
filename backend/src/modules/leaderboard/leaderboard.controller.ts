import type { Request, Response, NextFunction } from 'express';
import { leaderboardQuerySchema, userIdParamSchema } from './leaderboard.schema.js';
import * as leaderboardService from './leaderboard.service.js';

export async function getLeaderboard(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { window, limit, offset } = leaderboardQuerySchema.parse(req.query);
    const result = await leaderboardService.getLeaderboard(window, limit, offset);
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
    const { window } = leaderboardQuerySchema.parse(req.query);
    const result = await leaderboardService.getUserRank(userId, window);
    res.status(200).json({ data: result });
  } catch (err) {
    next(err);
  }
}
