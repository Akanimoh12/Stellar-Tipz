import { Request, Response, NextFunction } from "express";
import { z } from "zod";
import { BadRequestError } from "../../common/errors/AppError.js";
import { getLeaderboard } from "./leaderboard.service.js";
import { leaderboardQuerySchema } from "./leaderboard.schema.js";

/**
 * GET /leaderboard
 * Returns a paginated leaderboard in either the "tips" or "credit" variant.
 *
 * Query params:
 *   variant: "tips" | "credit"  (default: "tips")
 *   period:  "WEEKLY" | "MONTHLY" | "ALL_TIME"  (default: "ALL_TIME")
 *   page:    number  (default: 1)
 *   limit:   number  (default: 20, max: 100)
 *
 * Issue #933
 */
export async function getLeaderboardController(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const query = leaderboardQuerySchema.parse(req.query);
    const result = await getLeaderboard(
      query.variant,
      query.period,
      query.page,
      query.limit,
    );
    res.json({ data: result });
  } catch (error) {
    if (error instanceof z.ZodError) {
      next(new BadRequestError("Invalid query parameters", error.issues));
    } else {
      next(error);
    }
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
