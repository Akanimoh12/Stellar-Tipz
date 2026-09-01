import { randomBytes, createHash, timingSafeEqual } from "crypto";
import { Networks } from "@stellar/stellar-sdk";
import { isIP } from "net";
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
import {
  signAccessToken as signJwt,
  verifyAccessToken as verifyJwt,
} from "./jwt.js";
 
/**
 * ASSUMPTION (not confirmed in auth.types.js): shape of per-session metadata
 * captured at refresh-token issuance time. Move this into auth.types.ts if a
 * canonical definition already lives there — this local declaration exists
 * only so the file type-checks standalone.
 */
interface SessionMetadata {
  device: string;
  ipAddress: string;
}
 
/**
 * ASSUMPTION: a Redis client singleton exists at "../../lib/redis.js" and is
 * already used elsewhere in this repo (e.g. for BullMQ). Adjust the import
 * path if your Redis client lives somewhere else. If no Redis is available,
 * swap `checkAndIncrementRateLimit` for a DB-backed counter instead — the
 * call sites below don't need to change.
 */
import { redis } from "../../db/redis.js";
 
/**
 * Domain constant included in every signed challenge message.
 * Prevents cross-domain replay attacks — a signature produced for
 * tipz.app cannot be replayed against a different service.
 */
const AUTH_DOMAIN = "tipz.app";
 
/**
 * Each supported network maps to its real, distinct passphrase so the
 * "Network:" line in the signed message actually varies between
 * TESTNET/FUTURENET/MAINNET — this is what makes cross-network replay
 * protection real rather than cosmetic.
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
 * Creates a JWT access token with kid header (rotation-aware).
 */
function generateAccessToken(payload: AuthPayload): string {
  return signJwt(payload);
}
 
/**
 * Derives coarse device/browser info and a privacy-truncated IP from the
 * request, for display on a "your sessions" screen and for the reuse-
 * detection log line in refreshToken().
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
 
/**
 * Creates a refresh token and stores it in the database.
 *
 * Carries sessionId/familyId so refreshToken() can rotate within a session
 * and revoke an entire family on reuse detection. If a transaction client
 * is provided, the create is executed inside it; otherwise it uses the
 * global prisma client.
 *
 * ASSUMPTION: the RefreshToken model has sessionId, familyId, device,
 * ipAddress, and lastUsedAt columns in addition to the original
 * userId/hashedToken/expiresAt/revokedAt.
 */
async function generateRefreshToken(
  userId: string,
  metadata: SessionMetadata,
  tx?: Parameters<Parameters<typeof prisma.$transaction>[0]>[0],
  sessionId = randomBytes(16).toString("hex"),
  familyId = sessionId,
): Promise<{ token: string; sessionId: string; familyId: string }> {
  const token = randomBytes(32).toString("hex");
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
 * - Cross-network replay (testnet → mainnet)
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
 * secret material (e.g., challenge strings, tokens, addresses).
 */
function constantTimeCompare(a: string, b: string): boolean {
  if (a.length !== b.length) {
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
 *
 * Transactional boundary: the find-or-create is wrapped in an interactive
 * transaction (isolation ReadCommitted, timeout 5000ms, maxWait 2000ms) to
 * avoid racing duplicate creates. Expired-challenge cleanup happens outside
 * the transaction to keep it short. No external network calls are held
 * inside the transaction.
 *
 * ASSUMPTION: AuthChallenge has a nullable `usedAt` column — single-use is
 * enforced by setting it, not by deleting the row (see verifyChallenge).
 */
export async function createChallenge(
  stellarAddress: string,
  network: string | undefined,
  requestIp: string,
): Promise<ChallengeResponse> {
  const boundNetwork = network || env.STELLAR_NETWORK;
  const networkPassphrase = resolveNetworkPassphrase(boundNetwork);
 
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
 
  // Cleanup outside transaction (short, non-blocking).
  await prisma.authChallenge.deleteMany({
    where: {
      stellarAddress,
      expiresAt: { lt: new Date() },
    },
  });
 
  // Fast path: return an existing, unused, unexpired challenge without
  // opening a transaction.
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
      networkPassphrase,
      domain: AUTH_DOMAIN,
    };
  }
 
  // Wrap find-or-create in a transaction to prevent a race creating
  // duplicate challenges for the same address/network.
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
          networkPassphrase,
          domain: AUTH_DOMAIN,
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
        networkPassphrase,
        domain: AUTH_DOMAIN,
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
 * Rate limited per address and per IP to bound verification attempts.
 * Signature verification (CPU work) happens BEFORE the transaction; token
 * signing (no DB) happens AFTER commit. No external network calls are held
 * inside the transaction.
 *
 * Single-use enforcement: the challenge is re-checked and marked `usedAt`
 * inside the transaction, closing the TOCTOU window between the initial
 * lookup above and the write.
 */
export async function verifyChallenge(
  stellarAddress: string,
  signature: string,
  challenge: string,
  network: string | undefined,
  requestIp: string,
  metadata: SessionMetadata = { device: "Unknown device", ipAddress: "unknown" },
): Promise<TokenPair> {
  const expectedNetwork = network || env.STELLAR_NETWORK;
  resolveNetworkPassphrase(expectedNetwork); // throws BadRequestError if unsupported
 
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
 
  const authChallenge = await prisma.authChallenge.findUnique({
    where: { challenge },
  });
 
  if (!authChallenge) {
    throw new BadRequestError("Invalid challenge");
  }
 
  if (!constantTimeCompare(authChallenge.stellarAddress, stellarAddress)) {
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
 
  const networkPassphrase = resolveNetworkPassphrase(authChallenge.network);
  const expectedMessage = buildSignedMessage(
    stellarAddress,
    networkPassphrase,
    challenge,
    authChallenge.expiresAt,
  );
 
  const isValidSignature = verifyEd25519Signature(
    stellarAddress,
    expectedMessage,
    signature,
  );
 
  if (!isValidSignature) {
    throw new UnauthorizedError("Invalid signature");
  }
 
  const { user, refreshToken: newRefreshToken } = await prisma.$transaction(
    async (tx) => {
      // Re-check inside the transaction to close the TOCTOU window between
      // the lookup above and this write.
      const fresh = await tx.authChallenge.findUnique({
        where: { id: authChallenge.id },
      });
      if (!fresh || fresh.usedAt) {
        throw new ConflictError("Challenge already used");
      }
      await tx.authChallenge.update({
        where: { id: fresh.id },
        data: { usedAt: new Date() },
      });
 
      // Upsert is atomic at the DB level, so it's safe under concurrent
      // sign-ins without needing a P2002 fallback.
      const user = await tx.user.upsert({
        where: { stellarAddress },
        create: { stellarAddress },
        update: {},
      });
 
      const session = await generateRefreshToken(user.id, metadata, tx);
 
      return { user, refreshToken: session.token };
    },
    {
      timeout: 8000,
      maxWait: 2000,
      isolationLevel: "RepeatableRead",
    },
  );
 
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
    refreshToken: newRefreshToken,
  };
}
 
/**
 * Refreshes an access token using a refresh token.
 *
 * Rotation with reuse detection: each refresh revokes the presented token
 * and issues a new one in the same session/family. If an already-revoked
 * token is presented again (a sign of theft/replay), the entire family is
 * revoked and the request is rejected.
 *
 * Transactional boundary: re-validate + revoke old + create new refresh
 * token in a single transaction (isolation ReadCommitted, timeout 5000ms)
 * to close the TOCTOU window between the initial lookup and the write.
 */
export async function refreshToken(
  refreshToken: string,
  metadata: SessionMetadata = { device: "Unknown device", ipAddress: "unknown" },
): Promise<TokenPair> {
  const tokenRecord = await prisma.refreshToken.findUnique({
    where: { hashedToken: hashToken(refreshToken) },
    include: { user: true },
  });
 
  if (!tokenRecord) {
    throw new UnauthorizedError("Invalid refresh token");
  }
 
  if (tokenRecord.expiresAt < new Date()) {
    throw new UnauthorizedError("Refresh token expired");
  }
 
  if (tokenRecord.revokedAt) {
    const familyId =
      (tokenRecord as { familyId?: string }).familyId ?? tokenRecord.sessionId;
 
    await prisma.refreshToken.updateMany({
      where: { familyId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
 
    logger.warn(
      {
        userId: tokenRecord.userId,
        sessionId: tokenRecord.sessionId,
        familyId,
        ip: metadata.ipAddress,
        device: metadata.device,
        tokenId: tokenRecord.id,
        event: "refresh_token_reuse_detected",
      },
      "SECURITY: Refresh token reuse detected — entire family revoked (potential theft)",
    );
 
    throw new UnauthorizedError("Refresh token reuse detected — family revoked");
  }
 
  const familyId =
    (tokenRecord as { familyId?: string }).familyId ?? tokenRecord.sessionId;
 
  const newSession = await prisma.$transaction(
    async (tx) => {
      const fresh = await tx.refreshToken.findUnique({
        where: { id: tokenRecord.id },
      });
      if (!fresh || fresh.revokedAt || fresh.expiresAt < new Date()) {
        throw new UnauthorizedError("Invalid refresh token");
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
    {
      userId: tokenRecord.userId,
      sessionId: newSession.sessionId,
      familyId: newSession.familyId,
    },
    "Token refreshed successfully — rotated within family",
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
    throw new UnauthorizedError("Invalid refresh token");
  }
 
  if (tokenRecord.revokedAt) {
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
 
