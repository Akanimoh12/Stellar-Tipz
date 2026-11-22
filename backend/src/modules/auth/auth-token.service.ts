import { randomBytes, createHash } from 'crypto';
import { prisma } from '../../db/prisma.js';
import { env } from '../../config/env.js';
import { logger } from '../../common/utils/logger.js';
import { UnauthorizedError } from '../../common/errors/AppError.js';
import type { AuthPayload, TokenPair } from './auth.types.js';
import {
  signAccessToken as signJwt,
  verifyAccessToken as verifyJwt,
} from './jwt.js';
import type { SessionMetadata } from './auth-session.service.js';

/**
 * Helper to hash a refresh token.
 */
export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

/**
 * Parses a duration string (e.g., '7d', '15m') into milliseconds.
 */
export function parseDuration(duration: string): number {
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
 * Creates a JWT access token with kid header (rotation-aware).
 */
export function generateAccessToken(payload: AuthPayload): string {
  return signJwt(payload);
}

/**
 * Creates a refresh token and stores it in the database.
 *
 * Carries sessionId/familyId so refreshToken() can rotate within a session
 * and revoke an entire family on reuse detection. If a transaction client
 * is provided, the create is executed inside it; otherwise it uses the
 * global prisma client.
 */
export async function generateRefreshToken(
  userId: string,
  metadata: SessionMetadata,
  tx?: Parameters<Parameters<typeof prisma.$transaction>[0]>[0],
  sessionId = randomBytes(16).toString('hex'),
  familyId = sessionId,
): Promise<{ token: string; sessionId: string; familyId: string }> {
  const token = randomBytes(32).toString('hex');
  const expiresAt = new Date(
    Date.now() + parseDuration(env.REFRESH_TOKEN_EXPIRES_IN),
  );

  const client = (tx as typeof prisma) ?? prisma;
  await client.refreshToken.create({
    data: {
      userId,
      sessionId,
      familyId,
      hashedToken: hashToken(token),
      expiresAt,
      device: metadata.device,
      ipAddress: metadata.ipAddress,
      lastUsedAt: new Date(),
    },
  });

  return { token, sessionId, familyId };
}

/**
 * Refreshes an access token using a refresh token.
 *
 * Rotation with reuse detection: each refresh revokes the presented token
 * and issues a new one in the same session/family. If an already-revoked
 * token is presented again (a sign of theft/replay), the entire family is
 * revoked and the request is rejected.
 */
export async function refreshToken(
  refreshToken: string,
  metadata: SessionMetadata = { device: 'Unknown device', ipAddress: 'unknown' },
): Promise<TokenPair> {
  const tokenRecord = await prisma.refreshToken.findUnique({
    where: { hashedToken: hashToken(refreshToken) },
    include: { user: true },
  });

  if (!tokenRecord) {
    throw new UnauthorizedError('Invalid refresh token');
  }

  if (tokenRecord.expiresAt < new Date()) {
    throw new UnauthorizedError('Refresh token expired');
  }

  if (tokenRecord.revokedAt) {
    const familyId =
      (tokenRecord as { familyId?: string }).familyId ?? tokenRecord.sessionId;
    const revokedAt = new Date();

    await prisma.refreshToken.updateMany({
      where: { familyId, revokedAt: null },
      data: { revokedAt },
    });

    if (tokenRecord.sessionId && tokenRecord.sessionId !== familyId) {
      await prisma.refreshToken.updateMany({
        where: { sessionId: tokenRecord.sessionId, revokedAt: null },
        data: { revokedAt },
      });
    }

    logger.warn(
      {
        userId: tokenRecord.userId,
        sessionId: tokenRecord.sessionId,
        familyId,
        ip: metadata.ipAddress,
        device: metadata.device,
        tokenId: tokenRecord.id,
        event: 'refresh_token_reuse_detected',
      },
      'SECURITY: Refresh token reuse detected — entire family revoked (potential theft)',
    );

    throw new UnauthorizedError('Refresh token reuse detected — family revoked');
  }

  const familyId =
    (tokenRecord as { familyId?: string }).familyId ?? tokenRecord.sessionId;

  const newSession = await prisma.$transaction(
    async (tx) => {
      const fresh = await tx.refreshToken.findUnique({
        where: { id: tokenRecord.id },
      });
      if (!fresh || fresh.revokedAt || fresh.expiresAt < new Date()) {
        throw new UnauthorizedError('Invalid refresh token');
      }

      await tx.refreshToken.update({
        where: { id: fresh.id },
        data: { revokedAt: new Date(), lastUsedAt: new Date() },
      });

      return generateRefreshToken(
        fresh.userId,
        metadata,
        tx,
        fresh.sessionId,
        familyId,
      );
    },
    {
      timeout: 5000,
      maxWait: 2000,
      isolationLevel: 'ReadCommitted',
    },
  );

  const payload: AuthPayload = {
    userId: tokenRecord.userId,
    stellarAddress: tokenRecord.user.stellarAddress,
    role: tokenRecord.user.role,
    scopes: tokenRecord.user.scopes,
  };

  const accessToken = generateAccessToken(payload);

  logger.info(
    {
      userId: tokenRecord.userId,
      sessionId: newSession.sessionId,
      familyId: newSession.familyId,
    },
    'Token refreshed successfully — rotated within family',
  );

  return {
    accessToken,
    refreshToken: newSession.token,
  };
}

/**
 * Revokes a refresh token (logout).
 */
export async function revokeRefreshToken(refreshToken: string): Promise<void> {
  const tokenRecord = await prisma.refreshToken.findUnique({
    where: { hashedToken: hashToken(refreshToken) },
  });

  if (!tokenRecord) {
    throw new UnauthorizedError('Invalid refresh token');
  }

  if (tokenRecord.revokedAt) {
    return;
  }

  await prisma.refreshToken.update({
    where: { id: tokenRecord.id },
    data: { revokedAt: new Date() },
  });

  logger.info({ userId: tokenRecord.userId }, 'Refresh token revoked');
}

/**
 * Verifies a JWT access token (rotation-aware) and returns the payload.
 * Delegates to jwt.ts which handles kid validation and multi-key verification.
 */
export function verifyAccessToken(token: string): AuthPayload {
  return verifyJwt(token);
}
