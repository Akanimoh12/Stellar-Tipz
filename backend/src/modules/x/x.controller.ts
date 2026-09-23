/**
 * Controller for X integration endpoints (issues #1294, #1293).
 */

import type { Request, Response, NextFunction } from "express";
import { linkXAccountSchema } from "./x.schema.js";
import * as xService from "./x.service.js";
import { BadRequestError } from "../../common/errors/AppError.js";
import type { AuthPayload } from "../auth/auth.types.js";
import { z } from "zod";

declare global {
  namespace Express {
    interface Request {
      auth?: AuthPayload;
    }
  }
}

/**
 * POST /api/v1/x/link
 * Links authenticated user's X account with proof of ownership.
 */
export async function linkXAccountController(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    if (!req.auth) {
      throw new BadRequestError("Authentication required");
    }

    const payload = linkXAccountSchema.parse(req.body);
    const result = await xService.linkXAccount(req.auth.userId, payload);

    res.status(200).json({
      success: true,
      message: "X account linked successfully",
      data: result,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      next(new BadRequestError("Invalid request body", error.issues));
    } else {
      next(error);
    }
  }
}

/**
 * DELETE /api/v1/x/link
 * Unlinks authenticated user's X account.
 */
export async function unlinkXAccountController(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    if (!req.auth) {
      throw new BadRequestError("Authentication required");
    }

    await xService.unlinkXAccount(req.auth.userId);

    res.status(200).json({
      success: true,
      message: "X account unlinked successfully",
    });
  } catch (error) {
    next(error);
  }
}

/**
 * GET /api/v1/x/metrics/:handle
 * Retrieves X metrics for a user (public endpoint).
 */
export async function getXMetricsController(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { handle } = req.params;

    if (!handle || typeof handle !== "string") {
      throw new BadRequestError("X handle is required");
    }

    const metrics = await xService.getXMetrics(handle);

    res.status(200).json({
      success: true,
      data: metrics,
    });
  } catch (error) {
    next(error);
  }
}

/**
 * POST /api/v1/x/verify-proof
 * Verifies X account ownership (public endpoint for testing).
 */
export async function verifyProofController(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { xHandle, proofType, proofData } = req.body;

    if (!xHandle || !proofType || !proofData) {
      throw new BadRequestError("X handle, proof type, and proof data required");
    }

    const isValid = await xService.verifyOwnership(
      xHandle,
      proofData,
      proofType,
    );

    res.status(200).json({
      success: true,
      data: {
        verified: isValid,
        xHandle,
      },
    });
  } catch (error) {
    next(error);
  }
}

/**
 * GET /api/v1/x/quota-status
 * Returns current X API quota status (admin endpoint).
 */
export async function getQuotaStatusController(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    if (!req.auth || req.auth.role !== "admin") {
      throw new BadRequestError("Admin access required");
    }

    const isExhausted = await xService.isQuotaExhausted();

    res.status(200).json({
      success: true,
      data: {
        isExhausted,
        timestamp: new Date().toISOString(),
      },
    });
  } catch (error) {
    next(error);
  }
}
