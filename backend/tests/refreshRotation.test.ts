import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createHash, randomBytes } from 'crypto';

const mocks = vi.hoisted(() => ({
  mockFindUnique: vi.fn(),
  mockUpdate: vi.fn(),
  mockUpdateMany: vi.fn(),
  mockCreate: vi.fn(),
  mockTransaction: vi.fn(),
  mockLoggerWarn: vi.fn(),
  mockLoggerInfo: vi.fn(),
}));

// Mock env - must include all fields accessed at import time by
// config/index.ts, redis.ts, and auth.service dependencies.
vi.mock('../src/config/env.js', () => ({
  env: {
    NODE_ENV: 'test',
    PORT: 4001,
    API_BASE_PATH: '/api/v1',
    CORS_ORIGIN: ['http://localhost:5173'],
    DATABASE_URL: 'postgresql://tipz:tipz@localhost:5432/tipz_test',
    REDIS_URL: 'redis://localhost:6379',
    REALTIME_REDIS_ADAPTER_ENABLED: false,
    JWT_SECRET: 'test-jwt-secret-that-is-at-least-32-chars-long!!',
    JWT_EXPIRES_IN: '15m',
    REFRESH_TOKEN_EXPIRES_IN: '7d',
    AUTH_CHALLENGE_TTL_SECONDS: 300,
    AUTH_CHALLENGE_CLEANUP_CRON: '*/5 * * * *',
    AUTH_RATE_LIMIT_PER_IP: 30,
    AUTH_RATE_LIMIT_PER_ADDRESS: 10,
    AUTH_RATE_LIMIT_WINDOW_MS: 60000,
    RETENTION_PRUNE_CRON: '0 3 * * *',
    RETENTION_BATCH_SIZE: 500,
    STELLAR_NETWORK: 'TESTNET',
    SOROBAN_RPC_URL: 'https://soroban-testnet.stellar.org',
    HORIZON_URL: 'https://horizon-testnet.stellar.org',
    NETWORK_PASSPHRASE: 'Test SDF Network ; September 2015',
    INDEXER_POLL_INTERVAL_MS: 5000,
    INDEXER_LAG_THRESHOLD_LEDGERS: 50,
    INDEXER_STALL_INTERVALS: 3,
    INDEXER_FINALITY_DEPTH: 10,
    INDEXER_REORG_LOOKBACK: 64,
    INDEXER_LEADER_ELECTION_ENABLED: false,
    INDEXER_LEADER_KEY: 'tipz:indexer:leader',
    INDEXER_LEADER_LEASE_MS: 15000,
    INDEXER_LEADER_RENEW_INTERVAL_MS: 5000,
    CREDIT_RECOMPUTE_CRON: '0 */6 * * *',
    ANALYTICS_DAILY_CRON: '5 0 * * *',
    ANALYTICS_TIPPER_ROLLUP_CRON: '*/10 * * * *',
    LEADERBOARD_SNAPSHOT_CRON: '15 0 * * *',
    X_METRICS_REFRESH_CRON: '30 0 * * *',
    X_API_BASE_URL: 'https://api.twitter.com/2',
    IPFS_GATEWAY_URL: 'https://ipfs.io/ipfs/',
    DISCOVERY_TRENDING_WINDOW_DAYS: 14,
    DISCOVERY_TRENDING_HALFLIFE_DAYS: 7,
    DISCOVERY_TRENDING_TOP_N: 50,
    DISCOVERY_SIMILAR_TOP_N: 20,
    DISCOVERY_CACHE_TTL_SECONDS: 300,
    DISCOVERY_SCHEDULE_CRON: '*/15 * * * *',
    PLATFORM_STATS_CACHE_TTL_SECONDS: 300,
    PLATFORM_STATS_SCHEDULE_CRON: '*/10 * * * *',
    PAYOUT_SCHEDULE_CRON: '*/30 * * * *',
    PAYOUT_MAX_ATTEMPTS: 5,
    PAYOUT_BACKOFF_BASE_SECONDS: 60,
    PAYOUT_MIN_AMOUNT_STROOPS: 10000000n,
    WITHDRAWAL_MIN_AMOUNT_STROOPS: 10000000n,
    WITHDRAWAL_FEE_BPS: 200,
    SUBSCRIPTION_CHARGE_CRON: '0 * * * *',
    OG_IMAGE_TIMEOUT_MS: 3000,
    OG_IMAGE_CACHE_TTL_SECONDS: 86400,
    OG_IMAGE_CONCURRENCY: 4,
    SOROBAN_RPC_TIMEOUT_MS: 10000,
    HORIZON_TIMEOUT_MS: 8000,
    IPFS_TIMEOUT_MS: 15000,
    X_API_TIMEOUT_MS: 10000,
    REQUEST_TIMEOUT_MS: 30000,
    CIRCUIT_BREAKER_THRESHOLD: 5,
    CIRCUIT_BREAKER_RESET_TIMEOUT_MS: 30000,
    RPC_CIRCUIT_BREAKER_THRESHOLD: 5,
    RPC_CIRCUIT_BREAKER_RESET_TIMEOUT_MS: 30000,
    HORIZON_CIRCUIT_BREAKER_THRESHOLD: 5,
    HORIZON_CIRCUIT_BREAKER_RESET_TIMEOUT_MS: 30000,
    RETRY_MAX_ATTEMPTS: 3,
    RETRY_INITIAL_DELAY_MS: 100,
    RETRY_MAX_DELAY_MS: 5000,
    RETRY_FACTOR: 2,
    JSON_BODY_LIMIT: '100kb',
    MULTER_FILE_SIZE_LIMIT: 5242880,
    MULTER_FILES_LIMIT: 1,
    MULTER_FIELDS_LIMIT: 10,
    WORKER_CONCURRENCY_SUBSCRIPTION_CHARGE: 2,
    WORKER_CONCURRENCY_IPFS_PIN: 3,
    WORKER_CONCURRENCY_IPFS_CLEANUP: 2,
    WORKER_CONCURRENCY_X_REFRESH: 1,
    SOCKET_IO_MAX_BUFFER_SIZE: 1048576,
    SOCKET_IO_CONNECTION_TIMEOUT_MS: 30000,
    SOCKET_IO_HEARTBEAT_INTERVAL_MS: 25000,
    LOG_LEVEL: 'silent',
    OTEL_ENABLED: false,
    OTEL_SERVICE_NAME: 'stellar-tipz-backend',
    OTEL_EXPORTER_OTLP_ENDPOINT: 'http://localhost:4318/v1/traces',
    OTEL_SAMPLE_RATE: 0.1,
    METRICS_PORT: 0,
    METRICS_HOST: '127.0.0.1',
    ANALYTICS_CACHE_TTL_SECONDS: 60,
    ANALYTICS_ROLLUP_CACHE_TTL_SECONDS: 300,
    SLOW_QUERY_THRESHOLD_MS: 1000,
    DATABASE_POOL_SIZE: 10,
    DATABASE_POOL_TIMEOUT_SECONDS: 10,
    DATABASE_QUERY_TIMEOUT_MS: 30000,
  },
}));

// Mock logger
vi.mock('../src/common/utils/logger.js', () => ({
  logger: {
    info: (...args: unknown[]) => mocks.mockLoggerInfo(...args),
    warn: (...args: unknown[]) => mocks.mockLoggerWarn(...args),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

// Mock prisma
vi.mock('../src/db/prisma.js', () => ({
  prisma: {
    refreshToken: {
      findUnique: mocks.mockFindUnique,
      update: mocks.mockUpdate,
      updateMany: mocks.mockUpdateMany,
      create: mocks.mockCreate,
    },
    $transaction: mocks.mockTransaction,
  },
}));

import { refreshToken } from '../src/modules/auth/auth.service.js';
import { prisma } from '../src/db/prisma.js';

const { mockFindUnique, mockUpdate, mockUpdateMany, mockCreate, mockTransaction, mockLoggerWarn, mockLoggerInfo } = mocks;

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

describe('Refresh token rotation and reuse detection (issue #080)', () => {
  const user = {
    id: 'user_01',
    stellarAddress: 'GABC123',
    role: 'user',
    scopes: [] as string[],
  };

  const sessionId = 'sess_abc123';
  const familyId = 'family_xyz789';
  const rawToken = 'raw_refresh_token_123';
  const hashed = hashToken(rawToken);

  const now = new Date();
  const future = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7d
  const past = new Date(Date.now() - 1000);

  beforeEach(() => {
    vi.clearAllMocks();
    mockLoggerWarn.mockClear();
    mockLoggerInfo.mockClear();

    // Default transaction mock: executes callback with a tx object that has same methods
    mockTransaction.mockImplementation(async (cb: (tx: unknown) => Promise<unknown>) => {
      const tx = {
        refreshToken: {
          update: mockUpdate,
          create: mockCreate,
        },
      };
      return cb(tx);
    });

    mockCreate.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({
      id: 'new_id',
      sessionId: data.sessionId,
      familyId: data.familyId,
      hashedToken: data.hashedToken,
      userId: data.userId,
      device: data.device,
      ipAddress: data.ipAddress,
      expiresAt: data.expiresAt,
      lastUsedAt: data.lastUsedAt,
      revokedAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    }));
    mockUpdate.mockResolvedValue({});
    mockUpdateMany.mockResolvedValue({ count: 1 });
  });

  describe('normal rotation', () => {
    it('issues a new token and invalidates the old one', async () => {
      mockFindUnique.mockResolvedValue({
        id: 'token_id_01',
        userId: user.id,
        sessionId,
        familyId,
        hashedToken: hashed,
        device: 'Chrome on Windows',
        ipAddress: '1.2.3.0',
        expiresAt: future,
        revokedAt: null,
        lastUsedAt: now,
        createdAt: now,
        updatedAt: now,
        user,
      });

      const result = await refreshToken(rawToken, { device: 'Chrome on Windows', ipAddress: '1.2.3.0' });

      expect(result.accessToken).toBeDefined();
      expect(result.refreshToken).toBeDefined();
      expect(result.refreshToken).not.toBe(rawToken); // new token

      // Old token should be revoked via transaction update
      expect(mockUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'token_id_01' },
          data: expect.objectContaining({ revokedAt: expect.any(Date) }),
        }),
      );

      // New token should be created with same sessionId and familyId
      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            userId: user.id,
            sessionId,
            familyId,
          }),
        }),
      );

      // Hashed storage: create should receive hashedToken, not raw
      const createCall = mockCreate.mock.calls[0][0] as { data: Record<string, unknown> };
      expect(createCall.data.hashedToken).not.toBe(rawToken);
      expect(createCall.data.hashedToken).toBe(hashToken(result.refreshToken));
      // Ensure raw token not stored anywhere in mock calls
      expect(JSON.stringify(mockCreate.mock.calls)).not.toContain(rawToken);
    });

    it('preserves family lineage on rotation', async () => {
      mockFindUnique.mockResolvedValue({
        id: 'token_id_02',
        userId: user.id,
        sessionId,
        familyId,
        hashedToken: hashed,
        expiresAt: future,
        revokedAt: null,
        user,
      });

      const result = await refreshToken(rawToken);

      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ familyId }),
        }),
      );
      // Family lineage tracked (same familyId)
      const call = mockCreate.mock.calls[0][0] as { data: Record<string, unknown> };
      expect(call.data.familyId).toBe(familyId);
    });

    it('updates lastUsedAt on rotation', async () => {
      mockFindUnique.mockResolvedValue({
        id: 'token_id_03',
        userId: user.id,
        sessionId,
        familyId,
        hashedToken: hashed,
        expiresAt: future,
        revokedAt: null,
        user,
      });

      await refreshToken(rawToken);
      expect(mockUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ lastUsedAt: expect.any(Date) }),
        }),
      );
    });
  });

  describe('reuse detection — self-healing (the whole point)', () => {
    it('detects reuse of an already-rotated token and revokes the entire family', async () => {
      // Token is already revoked (rotated)
      mockFindUnique.mockResolvedValue({
        id: 'token_id_revoked',
        userId: user.id,
        sessionId,
        familyId,
        hashedToken: hashed,
        expiresAt: future,
        revokedAt: past, // already revoked
        user,
      });

      await expect(refreshToken(rawToken, { device: 'Attacker', ipAddress: '9.9.9.9' })).rejects.toThrow(/reuse/i);

      // Family revocation: updateMany by familyId
      expect(mockUpdateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ familyId }),
          data: expect.objectContaining({ revokedAt: expect.any(Date) }),
        }),
      );

      // Legacy fallback by sessionId also called
      expect(mockUpdateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ sessionId }),
        }),
      );
    });

    it('logs a security event on reuse detection', async () => {
      mockFindUnique.mockResolvedValue({
        id: 'token_id_revoked2',
        userId: user.id,
        sessionId,
        familyId,
        hashedToken: hashed,
        expiresAt: future,
        revokedAt: past,
        user,
      });

      await expect(refreshToken(rawToken)).rejects.toThrow();

      expect(mockLoggerWarn).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: user.id,
          familyId,
          sessionId,
          event: 'refresh_token_reuse_detected',
        }),
        expect.stringContaining('reuse detected'),
      );
    });

    it('revokes all active family tokens, forcing both attacker and legitimate user to re-auth', async () => {
      mockFindUnique.mockResolvedValue({
        id: 'token_old',
        userId: user.id,
        sessionId,
        familyId,
        hashedToken: hashed,
        expiresAt: future,
        revokedAt: past,
        user,
      });

      // Simulate family has 3 tokens, 1 already revoked, 2 active (new legitimate token + maybe other session)
      // Our code should call updateMany with revokedAt: null to revoke remaining active ones
      await expect(refreshToken(rawToken)).rejects.toThrow();

      // Both updateMany calls should filter revokedAt: null (only active)
      const calls = mockUpdateMany.mock.calls as Array<[{ where: Record<string, unknown> }]>;
      for (const call of calls) {
        expect(call[0].where.revokedAt).toBeNull();
      }
    });
  });

  describe('expiry and validation', () => {
    it('rejects expired refresh token', async () => {
      mockFindUnique.mockResolvedValue({
        id: 'token_expired',
        userId: user.id,
        sessionId,
        familyId,
        hashedToken: hashed,
        expiresAt: past, // expired
        revokedAt: null,
        user,
      });

      await expect(refreshToken(rawToken)).rejects.toThrow(/expired/i);
      expect(mockUpdate).not.toHaveBeenCalled();
      expect(mockCreate).not.toHaveBeenCalled();
    });

    it('rejects invalid (unknown) refresh token', async () => {
      mockFindUnique.mockResolvedValue(null);

      await expect(refreshToken('invalid_raw_token')).rejects.toThrow(/Invalid refresh token/);
    });

    it('throws on reused token even if expired? Expiry checked first', async () => {
      // If token is both expired and revoked, expiry should be checked before reuse?
      // Our implementation checks expiry before revokedAt, so expired should throw expired, not reuse.
      // This is intentional: expired tokens are not reuse candidates for family revocation.
      mockFindUnique.mockResolvedValue({
        id: 'token_both',
        userId: user.id,
        sessionId,
        familyId,
        hashedToken: hashed,
        expiresAt: past,
        revokedAt: past,
        user,
      });

      await expect(refreshToken(rawToken)).rejects.toThrow(/expired/i);
      // Should NOT have triggered family revocation via updateMany for reuse
      // (but our code checks expiry first, so reuse logic not reached)
      expect(mockUpdateMany).not.toHaveBeenCalled();
    });
  });

  describe('hashed storage verification', () => {
    it('never stores plaintext refresh token — only hash', async () => {
      mockFindUnique.mockResolvedValue({
        id: 'token_hash_check',
        userId: user.id,
        sessionId,
        familyId,
        hashedToken: hashed,
        expiresAt: future,
        revokedAt: null,
        user,
      });

      const result = await refreshToken(rawToken);
      const createData = (mockCreate.mock.calls[0][0] as { data: Record<string, unknown> }).data;

      // Stored hash must be sha256 hex, 64 chars, not equal to raw
      expect(createData.hashedToken).toMatch(/^[a-f0-9]{64}$/);
      expect(createData.hashedToken).not.toBe(result.refreshToken);
      expect(createData.hashedToken).not.toBe(rawToken);
      // Verify it equals hash of returned token
      expect(createData.hashedToken).toBe(hashToken(result.refreshToken));
    });

    it('lookup is by hash, not plaintext', async () => {
      mockFindUnique.mockResolvedValue({
        id: 'token_lookup',
        userId: user.id,
        sessionId,
        familyId,
        hashedToken: hashed,
        expiresAt: future,
        revokedAt: null,
        user,
      });

      await refreshToken(rawToken);
      expect(mockFindUnique).toHaveBeenCalledWith({
        where: { hashedToken: hashed },
        include: { user: true },
      });
    });
  });

  describe('family revocation via session fallback', () => {
    it('falls back to sessionId when familyId missing (pre-migration rows)', async () => {
      mockFindUnique.mockResolvedValue({
        id: 'token_legacy',
        userId: user.id,
        sessionId,
        // no familyId — legacy row
        hashedToken: hashed,
        expiresAt: future,
        revokedAt: past,
        user,
      });

      await expect(refreshToken(rawToken)).rejects.toThrow(/reuse/i);

      // Should still revoke via sessionId fallback
      expect(mockUpdateMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ sessionId }) }),
      );
      expect(mockLoggerWarn).toHaveBeenCalled();
    });
  });
});
