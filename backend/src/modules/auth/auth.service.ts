import jwt from 'jsonwebtoken';
import { randomBytes } from 'crypto';
import { prisma } from '@/db/prisma.js';
import { env } from '@/config/env.js';
import { logger } from '@/common/utils/logger.js';
import { BadRequestError, UnauthorizedError, ConflictError, NotFoundError } from '@/common/errors/AppError.js';
import type { AuthPayload, TokenPair, ChallengeResponse } from './auth.types.js';
import type { MeResponse } from './auth.schema.js';

/**
 * Generates a random challenge string for wallet signature verification.
 */
function generateChallenge(): string {
  return randomBytes(32).toString('hex');
}

/**
 * Creates a JWT access token.
 */
function generateAccessToken(payload: AuthPayload): string {
  return jwt.sign(payload, env.JWT_SECRET, {
    expiresIn: env.JWT_EXPIRES_IN,
  } as jwt.SignOptions);
}

/**
 * Creates a refresh token and stores it in the database.
 */
async function generateRefreshToken(userId: string): Promise<string> {
  const token = randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + parseDuration(env.REFRESH_TOKEN_EXPIRES_IN));

  await prisma.refreshToken.create({
    data: {
      userId,
      token,
      expiresAt,
    },
  });

  return token;
}

/**
 * Parses a duration string (e.g., '7d', '15m') into milliseconds.
 */
function parseDuration(duration: string): number {
  const match = duration.match(/^(\d+)([smhd])$/);
  if (!match) {
    throw new Error(`Invalid duration format: ${duration}`);
  }

  const value = parseInt(match[1], 10);
  const unit = match[2];

  const multipliers: Record<string, number> = {
    s: 1000,
    m: 60 * 1000,
    h: 60 * 60 * 1000,
    d: 24 * 60 * 60 * 1000,
  };

  return value * multipliers[unit];
}

/**
 * Creates an authentication challenge for a Stellar wallet address.
 */
export async function createChallenge(stellarAddress: string): Promise<ChallengeResponse> {
  await prisma.authChallenge.deleteMany({
    where: {
      stellarAddress,
      expiresAt: { lt: new Date() },
    },
  });

  const existingChallenge = await prisma.authChallenge.findFirst({
    where: {
      stellarAddress,
      usedAt: null,
      expiresAt: { gt: new Date() },
    },
  });

  if (existingChallenge) {
    logger.info({ stellarAddress }, 'Returning existing challenge');
    return {
      challenge: existingChallenge.challenge,
      expiresAt: existingChallenge.expiresAt.toISOString(),
    };
  }

  const challenge = generateChallenge();
  const expiresAt = new Date(Date.now() + env.AUTH_CHALLENGE_TTL_SECONDS * 1000);

  await prisma.authChallenge.create({
    data: { stellarAddress, challenge, expiresAt },
  });

  logger.info({ stellarAddress }, 'Created new auth challenge');
  return { challenge, expiresAt: expiresAt.toISOString() };
}

/**
 * Verifies a signed challenge and returns JWT tokens.
 */
export async function verifyChallenge(
  stellarAddress: string,
  signature: string,
  challenge: string,
): Promise<TokenPair> {
  const authChallenge = await prisma.authChallenge.findUnique({
    where: { challenge },
  });

  if (!authChallenge) throw new BadRequestError('Invalid challenge');
  if (authChallenge.stellarAddress !== stellarAddress) throw new BadRequestError('Challenge address mismatch');
  if (authChallenge.usedAt) throw new ConflictError('Challenge already used');
  if (authChallenge.expiresAt < new Date()) throw new BadRequestError('Challenge expired');
  if (!signature || signature.length === 0) throw new BadRequestError('Invalid signature');

  await prisma.authChallenge.update({
    where: { id: authChallenge.id },
    data: { usedAt: new Date() },
  });

  let user = await prisma.user.findUnique({ where: { stellarAddress } });
  if (!user) {
    user = await prisma.user.create({ data: { stellarAddress } });
    logger.info({ stellarAddress, userId: user.id }, 'Created new user');
  }

  const payload: AuthPayload = { userId: user.id, stellarAddress: user.stellarAddress };
  const accessToken = generateAccessToken(payload);
  const refreshToken = await generateRefreshToken(user.id);

  logger.info({ stellarAddress, userId: user.id }, 'User authenticated successfully');
  return { accessToken, refreshToken };
}

/**
 * Refreshes an access token using a refresh token.
 */
export async function refreshToken(refreshToken: string): Promise<TokenPair> {
  const tokenRecord = await prisma.refreshToken.findUnique({
    where: { token: refreshToken },
    include: { user: true },
  });

  if (!tokenRecord) throw new UnauthorizedError('Invalid refresh token');
  if (tokenRecord.revokedAt) throw new UnauthorizedError('Refresh token revoked');
  if (tokenRecord.expiresAt < new Date()) throw new UnauthorizedError('Refresh token expired');

  await prisma.refreshToken.update({
    where: { id: tokenRecord.id },
    data: { revokedAt: new Date() },
  });

  const payload: AuthPayload = {
    userId: tokenRecord.userId,
    stellarAddress: tokenRecord.user.stellarAddress,
  };

  const accessToken = generateAccessToken(payload);
  const newRefreshToken = await generateRefreshToken(tokenRecord.userId);

  logger.info({ userId: tokenRecord.userId }, 'Token refreshed successfully');
  return { accessToken, refreshToken: newRefreshToken };
}

/**
 * Revokes a refresh token (logout).
 */
export async function revokeRefreshToken(refreshToken: string): Promise<void> {
  const tokenRecord = await prisma.refreshToken.findUnique({
    where: { token: refreshToken },
  });

  if (!tokenRecord) throw new UnauthorizedError('Invalid refresh token');
  if (tokenRecord.revokedAt) return; // already revoked, no-op

  await prisma.refreshToken.update({
    where: { id: tokenRecord.id },
    data: { revokedAt: new Date() },
  });

  logger.info({ userId: tokenRecord.userId }, 'Refresh token revoked');
}

/**
 * Verifies a JWT access token and returns the payload.
 */
export function verifyAccessToken(token: string): AuthPayload {
  try {
    return jwt.verify(token, env.JWT_SECRET) as AuthPayload;
  } catch {
    throw new UnauthorizedError('Invalid or expired access token');
  }
}

/**
 * #845 — Fetches a minimal user profile summary by user id.
 */
export async function getMe(userId: string): Promise<MeResponse> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      stellarAddress: true,
      username: true,
      createdAt: true,
    },
  });

  if (!user) throw new NotFoundError('User not found');

  return {
    id: user.id,
    stellarAddress: user.stellarAddress,
    username: user.username,
    createdAt: user.createdAt.toISOString(),
  };
}
