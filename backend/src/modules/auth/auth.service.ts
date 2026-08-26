
Auth.service · TS
import jwt from "jsonwebtoken";
import { randomBytes, createHash, timingSafeEqual } from "crypto";
import { Networks } from "@stellar/stellar-sdk";
import { prisma } from "../../db/prisma.js";
import { env } from "../../config/env.js";
import { logger } from "../../common/utils/logger.js";
import {
  BadRequestError,
  UnauthorizedError,
  ConflictError,
  TooManyRequestsError,
} from "../../common/errors/AppError.js";
import type {
  AuthPayload,
  TokenPair,
  ChallengeResponse,
} from "./auth.types.js";
import { verifyEd25519Signature } from "./signature.js";
 
/**
 * ASSUMPTION: a Redis client singleton exists at "../../lib/redis.js" and is
 * already used elsewhere in this repo (e.g. for BullMQ). Adjust the import
 * path if your Redis client lives somewhere else. If no Redis is available,
 * swap `checkAndIncrementRateLimit` for a DB-backed counter instead — the
 * call sites below don't need to change.
 */
import { redis } from "../../lib/redis.js";
 
/**
 * Domain constant included in every signed challenge message.
 * Prevents cross-domain replay attacks — a signature produced for
 * tipz.app cannot be replayed against a different service.
 */
const AUTH_DOMAIN = "tipz.app";
 
/**
 * FIX: previously there was a single `env.NETWORK_PASSPHRASE` used
 * regardless of which network was requested, so the "Network:" line in the
 * signed message never actually varied between TESTNET/FUTURENET/MAINNET —
 * cross-network replay protection was not actually enforced. Each supported
 * network now maps to its real, distinct passphrase.
 */
const NETWORK_PASSPHRASES: Record<string, string> = {
  TESTNET: Networks.TESTNET,
  FUTURENET: Networks.FUTURENET,
  MAINNET: Networks.PUBLIC,
};
 
const ALLOWED_NETWORKS = new Set(Object.keys(NETWORK_PASSPHRASES));
 
/**
 * Rate limit config for challenge issuance and verification. These are read
 * directly from process.env with sane defaults; move them into the central
 * `env` schema (config/env.js) alongside AUTH_CHALLENGE_TTL_SECONDS if you'd
 * rather have them validated at boot like everything else here.
 */
const RATE_LIMIT_WINDOW_SECONDS = Number(
  process.env.AUTH_RATE_LIMIT_WINDOW_SECONDS ?? 60,
);
const CHALLENGE_RATE_LIMIT_MAX_PER_ADDRESS = Number(
  process.env.AUTH_CHALLENGE_RATE_LIMIT_MAX_PER_ADDRESS ?? 5,
);
const CHALLENGE_RATE_LIMIT_MAX_PER_IP = Number(
  process.env.AUTH_CHALLENGE_RATE_LIMIT_MAX_PER_IP ?? 20,
);
const VERIFY_RATE_LIMIT_MAX_PER_ADDRESS = Number(
  process.env.AUTH_VERIFY_RATE_LIMIT_MAX_PER_ADDRESS ?? 10,
);
const VERIFY_RATE_LIMIT_MAX_PER_IP = Number(
  process.env.AUTH_VERIFY_RATE_LIMIT_MAX_PER_IP ?? 40,
);
 
/**
 * Fixed-window rate limiter backed by Redis INCR/EXPIRE. INCR is atomic, so
 * concurrent requests racing on the same key still get a correct, strictly
 * increasing count — no separate read-then-write race window.
 */
async function checkAndIncrementRateLimit(
  scope: string,
  key: string,
  max: number,
): Promise<void> {
  const redisKey = `authchallenge:ratelimit:${scope}:${key}`;
  const count = await redis.incr(redisKey);
  if (count === 1) {
    await redis.expire(redisKey, RATE_LIMIT_WINDOW_SECONDS);
  }
  if (count > max) {
    logger.warn({ scope, key }, "Auth rate limit exceeded");
    throw new TooManyRequestsError(
      "Too many requests. Please try again shortly.",
    );
  }
}
 
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
async function generateRefreshToken(userId: string): Promise<string> {
  const token = randomBytes(32).toString("hex");
  const expiresAt = new Date(
    Date.now() + parseDuration(env.REFRESH_TOKEN_EXPIRES_IN),
  );
 
  await prisma.refreshToken.create({
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
 * Resolves the real Stellar network passphrase for a given network
 * identifier. Throws if the identifier isn't one this deployment supports,
 * rather than silently falling back to a single configured passphrase.
 */
function resolveNetworkPassphrase(network: string): string {
  const passphrase = NETWORK_PASSPHRASES[network];
  if (!passphrase) {
    throw new BadRequestError(`Unsupported network: ${network}`);
  }
  return passphrase;
}
 
/**
 * Builds the domain-bound message that the wallet must sign.
 *
 * Format:
 *   tipz.app
 *   Wallet: <stellarAddress>
 *   Network: <networkPassphrase>
 *   Nonce: <challenge>
 *   Expires: <expiresAt ISO-8601>
 *
 * Including domain, network passphrase, and expiry prevents:
 * - Cross-domain replay (tipz.app → other service)
 * - Cross-network replay (testnet → mainnet) — now actually enforced,
 *   since each network resolves to its own distinct passphrase.
 * - Long-lived replay (expired challenges)
 */
function buildSignedMessage(
  stellarAddress: string,
  networkPassphrase: string,
  challenge: string,
  expiresAt: Date,
): string {
  return [
    AUTH_DOMAIN,
    `Wallet: ${stellarAddress}`,
    `Network: ${networkPassphrase}`,
    `Nonce: ${challenge}`,
    `Expires: ${expiresAt.toISOString()}`,
  ].join("\n");
}
 
/**
 * Constant-time string comparison to prevent timing attacks on any
 * secret material (e.g., challenge strings, tokens).
 */
function constantTimeCompare(a: string, b: string): boolean {
  if (a.length !== b.length) {
    // Still do the comparison to avoid length-based timing oracle,
    // but we know they can't match.
    timingSafeEqual(Buffer.from(a), Buffer.from(a));
    return false;
  }
  return timingSafeEqual(Buffer.from(a), Buffer.from(b));
}
 
/**
 * Creates an authentication challenge for a Stellar wallet address.
 * The challenge is bound to the address and network to prevent cross-address
 * and cross-network replay attacks.
 *
 * Rate limited per address and per IP to prevent challenge-table flooding
 * and address enumeration.
 */
export async function createChallenge(
  stellarAddress: string,
  network: string | undefined,
  requestIp: string,
): Promise<ChallengeResponse> {
  const boundNetwork = network || env.STELLAR_NETWORK;
 
  if (!ALLOWED_NETWORKS.has(boundNetwork)) {
    throw new BadRequestError(`Unsupported network: ${boundNetwork}`);
  }
 
  await checkAndIncrementRateLimit(
    "challenge:addr",
    stellarAddress,
    CHALLENGE_RATE_LIMIT_MAX_PER_ADDRESS,
  );
  await checkAndIncrementRateLimit(
    "challenge:ip",
    requestIp,
    CHALLENGE_RATE_LIMIT_MAX_PER_IP,
  );
 
  const networkPassphrase = resolveNetworkPassphrase(boundNetwork);
 
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
      networkPassphrase,
      domain: AUTH_DOMAIN,
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
    networkPassphrase,
    domain: AUTH_DOMAIN,
  };
}
 
/**
 * Verifies a signed challenge and returns JWT tokens.
 * Uses ed25519 signature verification to prove wallet ownership.
 *
 * Single-use enforcement: the challenge is atomically deleted via deleteMany
 * with a count assertion. Only one concurrent request will see count=1;
 * all others are rejected, eliminating the TOCTOU race window.
 *
 * Rate limited per address and per IP to bound verification attempts.
 */
export async function verifyChallenge(
  stellarAddress: string,
  signature: string,
  challenge: string,
  network: string | undefined,
  requestIp: string,
): Promise<TokenPair> {
  const expectedNetwork = network || env.STELLAR_NETWORK;
 
  if (!ALLOWED_NETWORKS.has(expectedNetwork)) {
    throw new BadRequestError(`Unsupported network: ${expectedNetwork}`);
  }
 
  await checkAndIncrementRateLimit(
    "verify:addr",
    stellarAddress,
    VERIFY_RATE_LIMIT_MAX_PER_ADDRESS,
  );
  await checkAndIncrementRateLimit(
    "verify:ip",
    requestIp,
    VERIFY_RATE_LIMIT_MAX_PER_IP,
  );
 
  // Find the challenge
  const authChallenge = await prisma.authChallenge.findUnique({
    where: { challenge },
  });
 
  if (!authChallenge) {
    throw new BadRequestError("Invalid challenge");
  }
 
  // Validate that the challenge belongs to the requesting address
  if (!constantTimeCompare(authChallenge.stellarAddress, stellarAddress)) {
    throw new BadRequestError("Challenge address mismatch");
  }
 
  // Validate that the challenge is for the correct network
  if (authChallenge.network !== expectedNetwork) {
    throw new BadRequestError("Challenge network mismatch");
  }
 
  if (authChallenge.expiresAt < new Date()) {
    throw new BadRequestError("Challenge expired");
  }
 
  // Reconstruct the expected signed message using stored metadata.
  // FIX: this now resolves a passphrase that's actually distinct per
  // network, so a signature produced for one network's challenge can't
  // verify against another network's challenge even if every other field
  // matches.
  const networkPassphrase = resolveNetworkPassphrase(authChallenge.network);
  const expectedMessage = buildSignedMessage(
    stellarAddress,
    networkPassphrase,
    challenge,
    authChallenge.expiresAt,
  );
 
  // Verify the ed25519 signature against the domain-bound message
  const isValidSignature = verifyEd25519Signature(
    stellarAddress,
    expectedMessage,
    signature,
  );
 
  if (!isValidSignature) {
    throw new UnauthorizedError("Invalid signature");
  }
 
  // ── Atomic single-use enforcement ──────────────────────────────────────
  // deleteMany maps to a single DELETE … WHERE id = ? SQL statement, which
  // is atomic at the database level. Only one concurrent request will
  // receive count = 1; all others receive count = 0 and are rejected.
  const deleted = await prisma.authChallenge.deleteMany({
    where: {
      id: authChallenge.id,
    },
  });
 
  if (deleted.count === 0) {
    throw new ConflictError("Challenge already used");
  }
 
  // Find or create user (upsert is atomic — safe under concurrent requests)
  const user = await prisma.user.upsert({
    where: { stellarAddress },
    create: { stellarAddress },
    update: {},
  });
 
  logger.info({ stellarAddress, userId: user.id }, "User authenticated");
 
  // Generate tokens
  const payload: AuthPayload = {
    userId: user.id,
    stellarAddress: user.stellarAddress,
    role: user.role,
    scopes: user.scopes,
  };
 
  const accessToken = generateAccessToken(payload);
  const refreshToken = await generateRefreshToken(user.id);
 
  return {
    accessToken,
    refreshToken,
  };
}
 
/**
 * Refreshes an access token using a refresh token.
 */
export async function refreshToken(refreshToken: string): Promise<TokenPair> {
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
 
  const accessToken = generateAccessToken(payload);
  const newRefreshToken = await generateRefreshToken(tokenRecord.userId);
 
  logger.info({ userId: tokenRecord.userId }, "Token refreshed successfully");
 
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
 * Verifies a JWT access token and returns the payload.
 */
export function verifyAccessToken(token: string): AuthPayload {
  try {
    return jwt.verify(token, env.JWT_SECRET) as AuthPayload;
  } catch {
    throw new UnauthorizedError("Invalid or expired access token");
  }
}
 
/**
 * Prunes expired auth challenges from the database.
 * Called by the scheduled cleanup job.
 */
export async function pruneExpiredChallenges(): Promise<number> {
  const result = await prisma.authChallenge.deleteMany({
    where: {
      expiresAt: { lt: new Date() },
    },
  });
 
  if (result.count > 0) {
    logger.info({ count: result.count }, "Pruned expired auth challenges");
  }
 
  return result.count;
}
 
// Export constants for testing
export {
  AUTH_DOMAIN,
  NETWORK_PASSPHRASES,
  ALLOWED_NETWORKS,
  buildSignedMessage,
  resolveNetworkPassphrase,
  constantTimeCompare,
};
 
