import type { Request, Response, NextFunction } from 'express';
import * as statsService from './stats.service.js';

export async function getPlatformStats(
  _req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const result = await statsService.getPlatformStats();
    res.status(200).json(result);
  } catch (err) {
    next(err);
  }
}
