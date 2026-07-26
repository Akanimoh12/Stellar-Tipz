import type { Request, Response, NextFunction } from 'express';
import { searchCreatorsQuerySchema, trendingCreatorsQuerySchema } from './search.schema.js';
import * as searchService from './search.service.js';

/** GET /search/creators — search creators by name or username. */
export async function searchCreators(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { q, limit, offset } = searchCreatorsQuerySchema.parse(req.query);
    const result = await searchService.searchCreators(q, limit, offset);
    res.status(200).json(result);
  } catch (err) {
    next(err);
  }
}

/** GET /search/trending — trending creators ranked by tip volume (issue #1016). */
export async function getTrendingCreators(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { window, limit, offset } = trendingCreatorsQuerySchema.parse(req.query);
    const result = await searchService.getTrendingCreators(window, limit, offset);
    res.status(200).json(result);
  } catch (err) {
    next(err);
  }
}
