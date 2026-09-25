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

// Mock env
vi.mock('../src/config/env.js', () => ({
  env: {
    NODE_ENV: 'test',
    JWT_SECRET: 'test-jwt-secret-that-is-at-least-32-chars-long!!',
    JWT_EXPIRES_IN: '15m',
    REFRESH_TOKEN_EXPIRES_IN: '7d',
    CORS_ORIGIN: ['http://localhost:5173'],
    API_BASE_PATH: '/api/v1',
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
