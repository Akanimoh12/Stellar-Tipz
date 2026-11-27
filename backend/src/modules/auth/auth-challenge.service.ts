import { randomBytes, timingSafeEqual } from 'crypto';
import { Networks } from '@stellar/stellar-sdk';
import { prisma } from '../../db/prisma.js';
import { redis } from '../../db/redis.js';
import { env } from '../../config/env.js';
import { logger } from '../../common/utils/logger.js';
import { observeRegistration } from '../../common/observability/businessMetrics.js';
import { invalidateCreatorSearch } from '../search/search.cache.js';
import {
  BadRequestError,
  UnauthorizedError,
  ConflictError,
  TooManyRequestsError,
} from '../../common/errors/AppError.js';
import type {
  AuthPayload,
  TokenPair,
  ChallengeResponse,
} from './auth.types.js';
import { verifyEd25519Signature } from './signature.js';
import type { SessionMetadata } from './auth-session.service.js';
import {
  generateAccessToken,
  generateRefreshToken,
} from './auth-token.service.js';

/**
 * Domain constant included in every signed challenge message.
 * Prevents cross-domain replay attacks — a signature produced for
 * tipz.app cannot be replayed against a different service.
 */
export const AUTH_DOMAIN = 'tipz.app';

/**
 * Each supported network maps to its real, distinct passphrase so the
 * "Network:" line in the signed message actually varies between
 * LOCAL/TESTNET/FUTURENET/MAINNET — this is what makes cross-network replay
 * protection real rather than cosmetic.
 */
export const NETWORK_PASSPHRASES: Record<string, string> = {
  LOCAL: 'Standalone Network ; February 2017',
  TESTNET: Networks.TESTNET,
  FUTURENET: Networks.FUTURENET,
  MAINNET: Networks.PUBLIC,
};

export const ALLOWED_NETWORKS = new Set(Object.keys(NETWORK_PASSPHRASES));

/**
 * Rate limit config for challenge issuance and verification.
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
 * Fixed-window rate limiter backed by Redis INCR/EXPIRE.
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
    logger.warn({ scope, key }, 'Auth rate limit exceeded');
    throw new TooManyRequestsError(
      'Too many requests. Please try again shortly.',
    );
  }
}

/**
 * Generates a random challenge string for wallet signature verification.
 */
function generateChallenge(): string {
  return randomBytes(32).toString('hex');
}

/**
 * Resolves the real Stellar network passphrase for a given network
 * identifier. Throws if the identifier isn't one this deployment supports.
 */
export function resolveNetworkPassphrase(network: string): string {
  const passphrase = NETWORK_PASSPHRASES[network];
  if (!passphrase) {
    throw new BadRequestError(`Unsupported network: ${network}`);
  }
  return passphrase;
}

/**
 * Builds the domain-bound message that the wallet must sign.
 */
export function buildSignedMessage(
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
  ].join('\n');
}

/**
 * Constant-time string comparison to prevent timing attacks on any
 * secret material.
 */
export function constantTimeCompare(a: string, b: string): boolean {
  if (a.length !== b.length) {
    timingSafeEqual(Buffer.from(a), Buffer.from(a));
    return false;
  }
  return timingSafeEqual(Buffer.from(a), Buffer.from(b));
}

/**
 * Creates an authentication challenge for a Stellar wallet address.
 */
export async function createChallenge(
  stellarAddress: string,
  network: string | undefined,
  requestIp = 'unknown',
): Promise<ChallengeResponse> {
  const boundNetwork = network || env.STELLAR_NETWORK;
  const networkPassphrase = resolveNetworkPassphrase(boundNetwork);

  await checkAndIncrementRateLimit(
    'challenge:addr',
    stellarAddress,
    CHALLENGE_RATE_LIMIT_MAX_PER_ADDRESS,
  );
  await checkAndIncrementRateLimit(
    'challenge:ip',
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
      'Returning existing challenge',
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
        'Created new auth challenge',
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
      isolationLevel: 'ReadCommitted',
    },
  );
}

/**
 * Verifies a signed challenge and returns JWT tokens.
 */
export async function verifyChallenge(
  stellarAddress: string,
  signature: string,
  challenge: string,
  network: string | undefined,
  requestIp = 'unknown',
  metadata: SessionMetadata = { device: 'Unknown device', ipAddress: 'unknown' },
): Promise<TokenPair> {
  const expectedNetwork = network || env.STELLAR_NETWORK;
  resolveNetworkPassphrase(expectedNetwork); // throws BadRequestError if unsupported

  await checkAndIncrementRateLimit(
    'verify:addr',
    stellarAddress,
    VERIFY_RATE_LIMIT_MAX_PER_ADDRESS,
  );
  await checkAndIncrementRateLimit(
    'verify:ip',
    requestIp,
    VERIFY_RATE_LIMIT_MAX_PER_IP,
  );

  const authChallenge = await prisma.authChallenge.findUnique({
    where: { challenge },
  });

  if (!authChallenge) {
    throw new BadRequestError('Invalid challenge');
  }

  if (!constantTimeCompare(authChallenge.stellarAddress, stellarAddress)) {
    throw new BadRequestError('Challenge address mismatch');
  }

  if (authChallenge.network !== expectedNetwork) {
    throw new BadRequestError('Challenge network mismatch');
  }

  if (authChallenge.usedAt) {
    throw new ConflictError('Challenge already used');
  }

  if (authChallenge.expiresAt < new Date()) {
    throw new BadRequestError('Challenge expired');
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
    throw new UnauthorizedError('Invalid signature');
  }

  const { user, refreshToken: newRefreshToken, sessionId, registered } = await prisma.$transaction(
    async (tx) => {
      const fresh = await tx.authChallenge.findUnique({
        where: { id: authChallenge.id },
      });
      if (!fresh || fresh.usedAt) {
        throw new ConflictError('Challenge already used');
      }
      await tx.authChallenge.update({
        where: { id: fresh.id },
        data: { usedAt: new Date() },
      });

      const existingUser = await tx.user.findUnique({
        where: { stellarAddress },
        select: { id: true },
      });

      const user = await tx.user.upsert({
        where: { stellarAddress },
        create: { stellarAddress },
        update: {},
      });

      const session = await generateRefreshToken(user.id, metadata, tx);

      return {
        user,
        refreshToken: session.token,
        sessionId: session.sessionId,
        registered: existingUser === null,
      };
    },
    {
      timeout: 8000,
      maxWait: 2000,
      isolationLevel: 'RepeatableRead',
    },
  );

  if (registered) {
    observeRegistration('auth', 'success');
    await invalidateCreatorSearch([]);
  }

  const payload: AuthPayload = {
    userId: user.id,
    stellarAddress: user.stellarAddress,
    role: user.role,
    scopes: user.scopes,
    sessionId,
  };

  const accessToken = generateAccessToken(payload);

  logger.info(
    { stellarAddress, userId: user.id },
    'User authenticated successfully',
  );

  return {
    accessToken,
    refreshToken: newRefreshToken,
  };
}

/**
 * Prunes expired auth challenges from the database.
 */
export async function pruneExpiredChallenges(): Promise<number> {
  const result = await prisma.authChallenge.deleteMany({
    where: {
      expiresAt: { lt: new Date() },
    },
  });

  if (result.count > 0) {
    logger.info({ count: result.count }, 'Pruned expired auth challenges');
  }

  return result.count;
}
