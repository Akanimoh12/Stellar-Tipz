import { Request, Response, NextFunction } from "express";
import { NotFoundError } from "../../common/errors/AppError.js";
import { getStreak, getStreakByAddress } from "./streaks.service.js";

/**
 * GET /streaks/:userId
 * Gets streak data for a user.
 *
 * Issue #1270
 */
export async function getStreakController(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const { userId } = req.params;
    const streak = await getStreak(userId);
    res.json({ data: streak });
  } catch (error) {
    next(error);
  }
}

/**
 * GET /streaks/address/:stellarAddress
 * Gets streak data by stellar address.
 *
 * Issue #1270
 */
export async function getStreakByAddressController(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const { stellarAddress } = req.params;
    const streak = await getStreakByAddress(stellarAddress);
    res.json({ data: streak });
  } catch (error) {
    next(error);
  }
}
