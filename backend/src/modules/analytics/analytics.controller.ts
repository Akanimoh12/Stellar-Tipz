import type { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { BadRequestError } from '../../common/errors/AppError.js';
import { analyticsDailyQuerySchema, volumeQuerySchema, topTippersQuerySchema, creatorUsernameParamSchema, creatorAnalyticsQuerySchema } from './analytics.schema.js';
import * as analyticsService from './analytics.service.js';
import { getTipVolume, getTopTippers, getCreatorAnalytics } from './analytics.service.js';

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

/** GET /analytics/volume — tip volume time-series with granularity (issue #1008). */
export async function getTipVolumeController(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const query = volumeQuerySchema.parse(req.query);
    const result = await getTipVolume(
      query.granularity,
      query.startDate,
      query.endDate,
    );
    res.json({ data: result });
  } catch (error) {
    if (error instanceof z.ZodError) {
      next(new BadRequestError('Invalid query parameters', error.issues));
    } else {
      next(error);
    }
  }
}

/** GET /analytics/top-tippers — top tippers ranked by total stroops (issue #1009). */
export async function getTopTippersController(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const query = topTippersQuerySchema.parse(req.query);
    const result = await getTopTippers(query.page, query.limit);
    res.json({ data: result });
  } catch (error) {
    if (error instanceof z.ZodError) {
      next(new BadRequestError('Invalid query parameters', error.issues));
    } else {
      next(error);
    }
  }
}

/** GET /analytics/creators/:username — creator-specific analytics (issue #1006). */
export async function getCreatorAnalyticsController(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { username } = creatorUsernameParamSchema.parse(req.params);
    const query = creatorAnalyticsQuerySchema.parse(req.query);
    const result = await getCreatorAnalytics(username, query.startDate, query.endDate, query.granularity);
    res.status(200).json({ data: result });
  } catch (error) {
    if (error instanceof z.ZodError) {
      next(new BadRequestError('Invalid parameters', error.issues));
    } else {
      next(error);
    }
  }
}
