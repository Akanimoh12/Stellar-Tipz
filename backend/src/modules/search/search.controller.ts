import type { Request, Response, NextFunction } from 'express';
import { searchCreatorsQuerySchema } from './search.schema.js';
import * as searchService from './search.service.js';

/** GET /search/creators — search creators by name or username. */
export async function searchCreators(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { q, limit, offset, sort } = searchCreatorsQuerySchema.parse(req.query);
    const result = await searchService.searchCreators(q, limit, offset, sort);
    res.status(200).json(result);
  } catch (err) {
    next(err);
  }
}
