import jwt from "jsonwebtoken";
import { randomBytes, createHash } from "crypto";
import { isIP } from "net";
import { prisma } from "../../db/prisma.js";
import { env } from "../../config/env.js";
import { logger } from "../../common/utils/logger.js";
import {
  BadRequestError,
  UnauthorizedError,
  ConflictError,
  NotFoundError,
} from "../../common/errors/AppError.js";
import type {
  AuthPayload,
  TokenPair,
  ChallengeResponse,
  SessionMetadata,
  AuthSession,
} from "./auth.types.js";
import { verifyEd25519Signature } from "./signature.js";

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
export function getSessionMetadata(
  userAgent: string | undefined,
  ip: string | undefined,
): SessionMetadata {
  const browser = userAgent?.match(
    /(Edg|Chrome|Firefox|Safari|Opera)\/?([\d.]+)/i,
  )?.[1];
  const operatingSystem = userAgent?.match(
    /(Windows|Mac OS X|Android|iPhone|iPad|Linux)/i,
  )?.[1];

  return {
    device:
      [browser, operatingSystem].filter(Boolean).join(" on ") ||
      "Unknown device",
    ipAddress: truncateIp(ip),
  };
}

function truncateIp(ip: string | undefined): string {
  if (!ip) return "unknown";
  const normalized = ip.replace(/^::ffff:/i, "");
  if (isIP(normalized) === 4) {
    const parts = normalized.split(".");
    return `${parts[0]}.${parts[1]}.${parts[2]}.0`;
  }
  if (isIP(normalized) === 6) {
    const groups = normalized.split(":").filter(Boolean).slice(0, 3);
    return `${groups.join(":")}::`;
  }
  return "unknown";
}

async function generateRefreshToken(
  userId: string,
  metadata: SessionMetadata,
  sessionId = randomBytes(16).toString("hex"),
): Promise<{ token: string; id: string }> {
  const token = randomBytes(32).toString("hex");
  const expiresAt = new Date(
    Date.now() + parseDuration(env.REFRESH_TOKEN_EXPIRES_IN),
  );

  const record = await prisma.refreshToken.create({
    data: {
      userId,
      sessionId,
      hashedToken: hashToken(token),
      expiresAt,
      device: metadata.device,
      ipAddress: metadata.ipAddress,
      lastUsedAt: new Date(),
    },
  });

  return { token, id: record.sessionId };
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
 */
export async function createChallenge(
  stellarAddress: string,
  network?: string,
): Promise<ChallengeResponse> {
  const boundNetwork = network || env.STELLAR_NETWORK;

  // Clean up expired challenges for this address
  await prisma.authChallenge.deleteMany({
    where: {
      stellarAddress,
      expiresAt: { lt: new Date() },
    },
  });

  // Check for existing unused challenge for this address and network
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

  // Create new challenge
  const challenge = generateChallenge();
  const expiresAt = new Date(
    Date.now() + env.AUTH_CHALLENGE_TTL_SECONDS * 1000,
  );

  await prisma.authChallenge.create({
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
}

/**
 * Verifies a signed challenge and returns JWT tokens.
 * Uses ed25519 signature verification to prove wallet ownership.
 */
export async function verifyChallenge(
  stellarAddress: string,
  signature: string,
  challenge: string,
  network?: string,
  metadata: SessionMetadata = { device: "Unknown device", ipAddress: "unknown" },
): Promise<TokenPair> {
  const expectedNetwork = network || env.STELLAR_NETWORK;

  // Find the challenge
  const authChallenge = await prisma.authChallenge.findUnique({
    where: { challenge },
  });

  if (!authChallenge) {
    throw new BadRequestError("Invalid challenge");
  }

  // Validate that the challenge belongs to the requesting address
  if (authChallenge.stellarAddress !== stellarAddress) {
    throw new BadRequestError("Challenge address mismatch");
  }

  // Validate that the challenge is for the correct network
  if (authChallenge.network !== expectedNetwork) {
    throw new BadRequestError("Challenge network mismatch");
  }

  if (authChallenge.usedAt) {
    throw new ConflictError("Challenge already used");
  }

  if (authChallenge.expiresAt < new Date()) {
    throw new BadRequestError("Challenge expired");
  }

  // Verify the ed25519 signature
  const isValidSignature = verifyEd25519Signature(
    stellarAddress,
    challenge,
    signature,
  );

  if (!isValidSignature) {
    throw new UnauthorizedError("Invalid signature");
  }

  // Mark challenge as used
  await prisma.authChallenge.update({
    where: { id: authChallenge.id },
    data: { usedAt: new Date() },
  });

  // Find or create user
  let user = await prisma.user.findUnique({
    where: { stellarAddress },
  });

  if (!user) {
    user = await prisma.user.create({
      data: { stellarAddress },
    });
    logger.info({ stellarAddress, userId: user.id }, "Created new user");
  }

  // Generate tokens
  const payload: AuthPayload = {
    userId: user.id,
    stellarAddress: user.stellarAddress,
    role: user.role,
    scopes: user.scopes,
  };

  const session = await generateRefreshToken(user.id, metadata);
  const accessToken = generateAccessToken({ ...payload, sessionId: session.id });

  logger.info(
    { stellarAddress, userId: user.id },
    "User authenticated successfully",
  );

  return {
    accessToken,
    refreshToken: session.token,
  };
}

/**
 * Refreshes an access token using a refresh token.
 */
export async function refreshToken(
  refreshToken: string,
  metadata: SessionMetadata = { device: "Unknown device", ipAddress: "unknown" },
): Promise<TokenPair> {
  // Find the refresh token
  const tokenRecord = await prisma.refreshToken.findUnique({
    where: { hashedToken: hashToken(refreshToken) },
    include: { user: true },
  });

  if (!tokenRecord) {
    throw new UnauthorizedError("Invalid refresh token");
  }

  if (tokenRecord.revokedAt) {
    throw new UnauthorizedError("Refresh token revoked");
  }

  if (tokenRecord.expiresAt < new Date()) {
    throw new UnauthorizedError("Refresh token expired");
  }

  // Revoke old token
  await prisma.refreshToken.update({
    where: { id: tokenRecord.id },
    data: { revokedAt: new Date() },
  });

  // Generate new tokens with updated user info
  const payload: AuthPayload = {
    userId: tokenRecord.userId,
    stellarAddress: tokenRecord.user.stellarAddress,
    role: tokenRecord.user.role,
    scopes: tokenRecord.user.scopes,
  };

  const newSession = await generateRefreshToken(
    tokenRecord.userId,
    metadata,
    tokenRecord.sessionId,
  );
  const accessToken = generateAccessToken({
    ...payload,
    sessionId: newSession.id,
  });

  logger.info({ userId: tokenRecord.userId }, "Token refreshed successfully");

  return {
    accessToken,
    refreshToken: newSession.token,
  };
}

export async function listSessions(
  userId: string,
  currentSessionId?: string,
): Promise<AuthSession[]> {
  type SessionRecord = {
    sessionId: string;
    device: string;
    ipAddress: string;
    lastUsedAt: Date;
    createdAt: Date;
  };

  const sessions = await prisma.refreshToken.findMany({
    where: { userId, revokedAt: null, expiresAt: { gt: new Date() } },
    select: {
      sessionId: true,
      device: true,
      ipAddress: true,
      lastUsedAt: true,
      createdAt: true,
    },
    orderBy: { lastUsedAt: "desc" },
  });

  return (sessions as SessionRecord[]).map((session) => ({
    id: session.sessionId,
    device: session.device,
    ip: session.ipAddress,
    lastUsedAt: session.lastUsedAt.toISOString(),
    createdAt: session.createdAt.toISOString(),
    current: session.sessionId === currentSessionId,
  }));
}

export async function revokeSession(
  userId: string,
  sessionId: string,
): Promise<void> {
  const result = await prisma.refreshToken.updateMany({
    where: { sessionId, userId, revokedAt: null },
    data: { revokedAt: new Date() },
  });
  if (result.count === 0) throw new NotFoundError("Session not found");
}

export async function revokeOtherSessions(
  userId: string,
  currentSessionId?: string,
): Promise<void> {
  await prisma.refreshToken.updateMany({
    where: {
      userId,
      revokedAt: null,
      ...(currentSessionId ? { sessionId: { not: currentSessionId } } : {}),
    },
    data: { revokedAt: new Date() },
  });
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
 * Verifies a JWT access token and returns the payload.
 */
export function verifyAccessToken(token: string): AuthPayload {
  try {
    return jwt.verify(token, env.JWT_SECRET) as AuthPayload;
  } catch {
    throw new UnauthorizedError("Invalid or expired access token");
  }
}
