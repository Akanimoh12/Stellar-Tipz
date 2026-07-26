import type { Request, Response, NextFunction } from 'express';
import { analyticsDailyQuerySchema } from './analytics.schema.js';
import * as analyticsService from './analytics.service.js';

/** GET /analytics/daily — paginated daily analytics with optional date range. */
export async function getDailyAnalytics(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { startDate, endDate, limit, offset } = analyticsDailyQuerySchema.parse(req.query);
    const result = await analyticsService.getDailyAnalytics(startDate, endDate, limit, offset);
    res.status(200).json(result);
  } catch (err) {
    next(err);
  }
}

/** GET /analytics/summary — aggregated platform summary. */
export async function getAnalyticsSummary(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { startDate, endDate } = analyticsDailyQuerySchema.parse(req.query);
    const result = await analyticsService.getAnalyticsSummary(startDate, endDate);
    res.status(200).json({ data: result });
  } catch (err) {
    next(err);
  }
}
