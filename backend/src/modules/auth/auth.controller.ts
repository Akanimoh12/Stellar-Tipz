import { Request, Response, NextFunction } from "express";
import { z } from "zod";
import {
  BadRequestError,
  NotFoundError,
} from "../../common/errors/AppError.js";
import { prisma } from "../../db/prisma.js";
import {
  createChallenge,
  verifyChallenge,
  refreshToken as refreshTokens,
  revokeRefreshToken,
} from "./auth.service.js";
import { challengeSchema, verifySchema, refreshSchema } from "./auth.schema.js";
import type { AuthPayload } from "./auth.types.js";

/**
 * POST /auth/challenge
 * Creates an authentication challenge for a Stellar wallet address.
 */
export async function challengeController(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { stellarAddress, network } = challengeSchema.parse(req.body);
    const response = await createChallenge(stellarAddress, network);
    res.json(response);
  } catch (error) {
    if (error instanceof z.ZodError) {
      next(new BadRequestError("Invalid request body", error.issues));
    } else {
      next(error);
    }
  }
}

/**
 * POST /auth/verify
 * Verifies a signed challenge and returns JWT tokens.
 */
export async function verifyController(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { stellarAddress, signature, challenge, network } =
      verifySchema.parse(req.body);
    const tokens = await verifyChallenge(
      stellarAddress,
      signature,
      challenge,
      network,
    );
    res.json(tokens);
  } catch (error) {
    if (error instanceof z.ZodError) {
      next(new BadRequestError("Invalid request body", error.issues));
    } else {
      next(error);
    }
  }
}

/**
 * GET /auth/me
 * Returns the current authenticated user's profile summary.
 * Requires: authMiddleware (populates req.auth).
 */
export async function meController(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const auth = req.auth as AuthPayload;
    const user = await prisma.user.findUnique({
      where: { id: auth.userId },
      select: {
        id: true,
        stellarAddress: true,
        username: true,
        role: true,
        scopes: true,
        createdAt: true,
      },
    });

    if (!user) {
      throw new NotFoundError("User not found");
    }

    res.json({
      id: user.id,
      stellarAddress: user.stellarAddress,
      username: user.username,
      role: user.role,
      scopes: user.scopes,
      createdAt: user.createdAt.toISOString(),
    });
  } catch (error) {
    next(error);
  }
}

/**
 * POST /auth/refresh
 * Refreshes an access token using a refresh token.
 */
export async function refreshController(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { refreshToken } = refreshSchema.parse(req.body);
    const tokens = await refreshTokens(refreshToken);
    res.json(tokens);
  } catch (error) {
    if (error instanceof z.ZodError) {
      next(new BadRequestError("Invalid request body", error.issues));
    } else {
      next(error);
    }
  }
}

/**
 * POST /auth/logout
 * Revokes the current refresh token.
 */
export async function logoutController(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { refreshToken } = refreshSchema.parse(req.body);
    await revokeRefreshToken(refreshToken);
    res.json({ message: "Logged out successfully" });
  } catch (error) {
    if (error instanceof z.ZodError) {
      next(new BadRequestError("Invalid request body", error.issues));
    } else {
      next(error);
    }
  }
}
