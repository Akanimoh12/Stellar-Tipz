import type { Request, Response, NextFunction } from 'express';
import * as streaksService from './streaks.service.js';

export async function getMyStreak(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const result = await streaksService.getMyStreak(req.user!.id);
    res.status(200).json({ data: result });
  } catch (err) {
    next(err);
  }
}
