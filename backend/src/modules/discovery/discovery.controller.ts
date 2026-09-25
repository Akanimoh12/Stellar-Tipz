import type { Request, Response, NextFunction } from 'express';
import { trendingQuerySchema, similarQuerySchema } from './discovery.schema.js';
import * as discoveryService from './discovery.service.js';

export async function getTrending(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { limit, offset } = trendingQuerySchema.parse(req.query);
    const result = await discoveryService.getTrending(limit, offset);
    res.status(200).json(result);
  } catch (err) {
    next(err);
  }
}

export async function getSimilar(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { username } = req.params as { username: string };
    const { limit } = similarQuerySchema.parse(req.query);
    const result = await discoveryService.getSimilar(username, limit);
    res.status(200).json(result);
  } catch (err) {
    next(err);
  }
}
