import { randomBytes, createHash } from "crypto";
import { prisma } from "../../db/prisma.js";
import { env } from "../../config/env.js";
import { logger } from "../../common/utils/logger.js";
import {
  BadRequestError,
  UnauthorizedError,
  ConflictError,
} from "../../common/errors/AppError.js";
import type {
  AuthPayload,
  TokenPair,
  ChallengeResponse,
} from "./auth.types.js";
import { verifyEd25519Signature } from "./signature.js";
import {
  signAccessToken as signJwt,
  verifyAccessToken as verifyJwt,
} from "./jwt.js";

/**
 * Helper to hash a refresh token.
 */
function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/**
 * Generates a random challenge string for wallet signature verification.
 */
function generateChallenge(): string {
  return randomBytes(32).toString("hex");
}

/**
 * Creates a JWT access token with kid header (rotation-aware).
 */
function generateAccessToken(payload: AuthPayload): string {
  return signJwt(payload);
}

/**
 * Creates a refresh token and stores it in the database.
 * If a transaction client is provided, the create is executed inside it;
 * otherwise it uses the global prisma client.
 */
async function generateRefreshToken(userId: string, tx?: Parameters<Parameters<typeof prisma.$transaction>[0]>[0]): Promise<string> {
  const token = randomBytes(32).toString("hex");
  const expiresAt = new Date(
    Date.now() + parseDuration(env.REFRESH_TOKEN_EXPIRES_IN),
  );

  const client = (tx as typeof prisma) ?? prisma;
  await client.refreshToken.create({
    data: {
      userId,
      hashedToken: hashToken(token),
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
 * The challenge is bound to the address and network to prevent cross-address/network replay attacks.
 *
 * Transactional boundary: find-or-create is wrapped in an interactive transaction
 * (isolation ReadCommitted, timeout 5000ms, maxWait 2000ms). Expired cleanup
 * happens outside the transaction to keep it short. No external network calls
 * are held inside the transaction.
 */
export async function createChallenge(
  stellarAddress: string,
  network?: string,
): Promise<ChallengeResponse> {
  const boundNetwork = network || env.STELLAR_NETWORK;

  // Cleanup outside transaction (short, non-blocking)
  await prisma.authChallenge.deleteMany({
    where: {
      stellarAddress,
      expiresAt: { lt: new Date() },
    },
  });

  // Fast path: return existing without transaction
  const existingChallenge = await prisma.authChallenge.findFirst({
    where: {
      stellarAddress,
      network: boundNetwork,
      usedAt: null,
      expiresAt: { gt: new Date() },
    },
  });

  if (existingChallenge) {
    logger.info(
      { stellarAddress, network: boundNetwork },
      "Returning existing challenge",
    );
    return {
      challenge: existingChallenge.challenge,
      expiresAt: existingChallenge.expiresAt.toISOString(),
      network: existingChallenge.network,
    };
  }

  // Wrap find-or-create in transaction to prevent race creating duplicates
  return prisma.$transaction(
    async (tx) => {
      const existing = await tx.authChallenge.findFirst({
        where: {
          stellarAddress,
          network: boundNetwork,
          usedAt: null,
          expiresAt: { gt: new Date() },
        },
      });
      if (existing) {
        return {
          challenge: existing.challenge,
          expiresAt: existing.expiresAt.toISOString(),
          network: existing.network,
        };
      }

      const challenge = generateChallenge();
      const expiresAt = new Date(
        Date.now() + env.AUTH_CHALLENGE_TTL_SECONDS * 1000,
      );

      await tx.authChallenge.create({
        data: {
          stellarAddress,
          challenge,
          network: boundNetwork,
          expiresAt,
        },
      });

      logger.info(
        { stellarAddress, network: boundNetwork },
        "Created new auth challenge",
      );

      return {
        challenge,
        expiresAt: expiresAt.toISOString(),
        network: boundNetwork,
      };
    },
    {
      timeout: 5000,
      maxWait: 2000,
      isolationLevel: "ReadCommitted",
    },
  );
}

/**
 * Verifies a signed challenge and returns JWT tokens.
 * Uses ed25519 signature verification to prove wallet ownership.
 *
 * Transactional boundary: challenge consumption + user find-or-create +
 * refresh token creation are wrapped in a single interactive transaction
 * (isolation RepeatableRead, timeout 8000ms). Signature verification
 * (CPU work) happens BEFORE the transaction; token signing (no DB) happens
 * AFTER commit. No external network calls are held inside the transaction.
 */
export async function verifyChallenge(
  stellarAddress: string,
  signature: string,
  challenge: string,
  network?: string,
): Promise<TokenPair> {
  const expectedNetwork = network || env.STELLAR_NETWORK;

  // Find the challenge (outside transaction for early validation)
  const authChallenge = await prisma.authChallenge.findUnique({
    where: { challenge },
  });

  if (!authChallenge) {
    throw new BadRequestError("Invalid challenge");
  }

  if (authChallenge.stellarAddress !== stellarAddress) {
    throw new BadRequestError("Challenge address mismatch");
  }

  if (authChallenge.network !== expectedNetwork) {
    throw new BadRequestError("Challenge network mismatch");
  }

  if (authChallenge.usedAt) {
    throw new ConflictError("Challenge already used");
  }

  if (authChallenge.expiresAt < new Date()) {
    throw new BadRequestError("Challenge expired");
  }

  // Verify the ed25519 signature BEFORE opening transaction (keep tx short)
  const isValidSignature = verifyEd25519Signature(
    stellarAddress,
    challenge,
    signature,
  );

  if (!isValidSignature) {
    throw new UnauthorizedError("Invalid signature");
  }

  // Wrap DB writes in transaction: mark used + find-or-create user + create refresh token
  const { user, refreshToken } = await prisma.$transaction(
    async (tx) => {
      // Re-check and mark challenge as used inside tx to prevent double-use race
      const fresh = await tx.authChallenge.findUnique({ where: { challenge } });
      if (!fresh || fresh.usedAt) {
        throw new ConflictError("Challenge already used");
      }
      await tx.authChallenge.update({
        where: { id: fresh.id },
        data: { usedAt: new Date() },
      });

      let user = await tx.user.findUnique({
        where: { stellarAddress },
      });

      if (!user) {
        user = await tx.user.create({
          data: { stellarAddress },
        });
        logger.info({ stellarAddress, userId: user.id }, "Created new user");
      }

      const token = randomBytes(32).toString("hex");
      const expiresAt = new Date(
        Date.now() + parseDuration(env.REFRESH_TOKEN_EXPIRES_IN),
      );
      await tx.refreshToken.create({
        data: {
          userId: user.id,
          hashedToken: hashToken(token),
          expiresAt,
        },
      });

      return { user, refreshToken: token };
    },
    {
      timeout: 8000,
      maxWait: 2000,
      isolationLevel: "RepeatableRead",
    },
  );

  // Sign access token AFTER transaction commit (no DB)
  const payload: AuthPayload = {
    userId: user.id,
    stellarAddress: user.stellarAddress,
    role: user.role,
    scopes: user.scopes,
  };

  const accessToken = generateAccessToken(payload);

  logger.info(
    { stellarAddress, userId: user.id },
    "User authenticated successfully",
  );

  return {
    accessToken,
    refreshToken,
  };
}

/**
 * Refreshes an access token using a refresh token.
 *
 * Transactional boundary: revoke old + create new refresh token in a single
 * transaction (isolation ReadCommitted, timeout 5000ms). Validation
 * happens before transaction; signing happens after.
 */
export async function refreshToken(refreshToken: string): Promise<TokenPair> {
  const tokenRecord = await prisma.refreshToken.findUnique({
    where: { hashedToken: hashToken(refreshToken) },
    include: { user: true },
  });

  if (!tokenRecord) {
    throw new UnauthorizedError("Invalid refresh token");
  }

  // Expiry check before revocation logic — expired tokens are not reuse candidates
  if (tokenRecord.expiresAt < new Date()) {
    throw new UnauthorizedError("Refresh token expired");
  }

  const newRefreshToken = await prisma.$transaction(
    async (tx) => {
      const fresh = await tx.refreshToken.findUnique({
        where: { hashedToken: hashToken(refreshToken) },
        include: { user: true },
      });
      if (!fresh || fresh.revokedAt || fresh.expiresAt < new Date()) {
        throw new UnauthorizedError("Invalid refresh token");
      }
      await tx.refreshToken.update({
        where: { id: fresh.id },
        data: { revokedAt: new Date() },
      });

      const token = randomBytes(32).toString("hex");
      const expiresAt = new Date(
        Date.now() + parseDuration(env.REFRESH_TOKEN_EXPIRES_IN),
      );
      await tx.refreshToken.create({
        data: {
          userId: fresh.userId,
          hashedToken: hashToken(token),
          expiresAt,
        },
      });
      return token;
    },
    {
      timeout: 5000,
      maxWait: 2000,
      isolationLevel: "ReadCommitted",
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
    { userId: tokenRecord.userId, sessionId: newSession.id, familyId: newSession.familyId },
    "Token refreshed successfully — rotated within family",
  );

  return {
    accessToken,
    refreshToken: newRefreshToken,
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
    throw new UnauthorizedError("Invalid refresh token");
  }

  if (tokenRecord.revokedAt) {
    // Already revoked, no-op
    return;
  }

  await prisma.refreshToken.update({
    where: { id: tokenRecord.id },
    data: { revokedAt: new Date() },
  });

  logger.info({ userId: tokenRecord.userId }, "Refresh token revoked");
}

/**
 * Verifies a JWT access token (rotation-aware) and returns the payload.
 * Delegates to jwt.ts which handles kid validation and multi-key verification.
 */
export function verifyAccessToken(token: string): AuthPayload {
  return verifyJwt(token);
}
