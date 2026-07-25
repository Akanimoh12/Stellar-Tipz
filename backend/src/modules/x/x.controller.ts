import { Request, Response, NextFunction } from "express";
import { z } from "zod";
import { BadRequestError } from "../../common/errors/AppError.js";
import { fetchXMetrics, getCachedXMetrics } from "./x.service.js";
import { fetchMetricsSchema } from "./x.schema.js";

/**
 * GET /x/metrics/:handle
 * Fetches X account metrics with optional fallback to cached data.
 */
export async function getXMetricsController(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { handle } = req.params;
    const useFallback =
      req.query.useFallback === "true" || req.query.useFallback === undefined;
    const maxCacheAge = req.query.maxCacheAge
      ? parseInt(req.query.maxCacheAge as string, 10)
      : undefined;

    const input = fetchMetricsSchema.parse({
      handle,
      useFallback,
      maxCacheAge,
    });

    const metrics = await fetchXMetrics(input.handle, {
      useFallback: input.useFallback,
      maxCacheAge: input.maxCacheAge,
    });

    res.json({
      handle: metrics.handle,
      followers: metrics.followers,
      engagement: metrics.engagement ?? null,
      fetchedAt: metrics.fetchedAt.toISOString(),
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      next(new BadRequestError("Invalid request parameters", error.issues));
    } else {
      next(error);
    }
  }
}

/**
 * GET /x/cached/:handle
 * Gets cached X metrics without calling the API.
 */
export async function getCachedXMetricsController(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { handle } = req.params;

    if (!handle || handle.length === 0) {
      throw new BadRequestError("X handle is required");
    }

    const metrics = await getCachedXMetrics(handle);

    if (!metrics) {
      res.status(404).json({
        error: "No cached data available for this handle",
      });
      return;
    }

    res.json({
      handle: metrics.handle,
      followers: metrics.followers,
      engagement: metrics.engagement ?? null,
      fetchedAt: metrics.fetchedAt.toISOString(),
    });
  } catch (error) {
    next(error);
  }
}
