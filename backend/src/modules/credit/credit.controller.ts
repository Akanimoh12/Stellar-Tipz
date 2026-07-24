import { Request, Response, NextFunction } from "express";
import { z } from "zod";
import { BadRequestError } from "../../common/errors/AppError.js";
import { getCreditScore, recomputeCreditScore } from "./credit.service.js";
import { userIdParamSchema } from "./credit.schema.js";

/**
 * GET /credit/:userId
 * Returns the credit score for a user (computed fresh – no persistent cache yet).
 * Issues #920 · #919 · #922
 */
export async function getCreditScoreController(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const { userId } = userIdParamSchema.parse(req.params);
    const score = await getCreditScore(userId);
    res.json({ data: score });
  } catch (error) {
    if (error instanceof z.ZodError) {
      next(new BadRequestError("Invalid userId", error.issues));
    } else {
      next(error);
    }
  }
}

/**
 * POST /credit/:userId/recompute
 * Triggers a fresh credit-score recompute after X metrics refresh (issue #919).
 * Intended to be called by the background X-metrics refresh job, not directly
 * by end users.
 */
export async function recomputeCreditScoreController(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const { userId } = userIdParamSchema.parse(req.params);
    const score = await recomputeCreditScore(userId);
    res.json({ data: score });
  } catch (error) {
    if (error instanceof z.ZodError) {
      next(new BadRequestError("Invalid userId", error.issues));
    } else {
      next(error);
    }
import type { Request, Response, NextFunction } from 'express';
import { usernameParamSchema, recalculateSchema } from './credit.schema.js';
import { userIdParamSchema, recalculateSchema, creditHistoryQuerySchema } from './credit.schema.js';
import * as creditService from './credit.service.js';

export async function getCreditScore(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { username } = usernameParamSchema.parse(req.params);
    const result = await creditService.getCreditScoreByUsername(username);
    res.status(200).json({ data: result });
  } catch (err) {
    next(err);
  }
}

export async function getCreditScoreHistory(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { userId } = userIdParamSchema.parse(req.params);
    const { limit, offset } = creditHistoryQuerySchema.parse(req.query);
    const result = await creditService.getCreditScoreHistory(userId, limit, offset);
    res.status(200).json({ data: result });
  } catch (err) {
    next(err);
  }
}

export async function recalculate(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { userId } = recalculateSchema.parse(req.body);
    const result = await creditService.recalculateCreditScore(userId);
    res.status(200).json({ data: result });
  } catch (err) {
    next(err);
  }
}
