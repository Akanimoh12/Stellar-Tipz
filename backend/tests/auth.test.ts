import request from 'supertest';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { createApp } from '../src/app.js';
import { UnauthorizedError } from '../src/common/errors/AppError.js';
import { prisma } from '../src/db/prisma.js';

// Mock the auth service
vi.mock('../src/modules/auth/auth.service.js', () => ({
  createChallenge: vi.fn(),
  verifyChallenge: vi.fn(),
  refreshToken: vi.fn(),
  revokeRefreshToken: vi.fn(),
  verifyAccessToken: vi.fn(),
}));

// Mock Prisma
vi.mock('../src/db/prisma.js', () => ({
  prisma: {
    user: {
      findUnique: vi.fn(),
    },
  },
}));

import {
  createChallenge,
  verifyChallenge,
  refreshToken as refreshTokens,
  revokeRefreshToken,
  verifyAccessToken,
} from '../src/modules/auth/auth.service.js';

describe('Auth Flow End-to-End', () => {
  const app = createApp();
  const stellarAddress = 'GABCD...TEST';
  let accessToken: string;
  let refreshToken: string;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('POST /api/v1/auth/challenge', () => {
    it('creates a new challenge', async () => {
      const mockChallenge = {
        challenge: 'a'.repeat(64),
        expiresAt: new Date(Date.now() + 300000).toISOString(),
      };
      vi.mocked(createChallenge).mockResolvedValue(mockChallenge);

      const res = await request(app)
        .post('/api/v1/auth/challenge')
        .send({ stellarAddress });

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('challenge');
      expect(res.body).toHaveProperty('expiresAt');
      expect(res.body.challenge).toBe(mockChallenge.challenge);
    });

    it('validates stellarAddress is required', async () => {
      const res = await request(app)
        .post('/api/v1/auth/challenge')
        .send({});

      expect(res.status).toBe(400);
      expect(res.body.error).toHaveProperty('code');
    });

    it('validates stellarAddress is not empty', async () => {
      const res = await request(app)
        .post('/api/v1/auth/challenge')
        .send({ stellarAddress: '' });

      expect(res.status).toBe(400);
      expect(res.body.error).toHaveProperty('code');
    });
  });

  describe('POST /api/v1/auth/verify', () => {
    it('verifies challenge and returns tokens (happy path)', async () => {
      const mockTokens = {
        accessToken: 'mock_access_token',
        refreshToken: 'mock_refresh_token',
      };
      vi.mocked(verifyChallenge).mockResolvedValue(mockTokens);

      const res = await request(app)
        .post('/api/v1/auth/verify')
        .send({
          stellarAddress,
          signature: 'test_signature',
          challenge: 'test_challenge',
        });

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('accessToken');
      expect(res.body).toHaveProperty('refreshToken');
    });

    it('validates all required fields', async () => {
      const res = await request(app)
        .post('/api/v1/auth/verify')
        .send({});

      expect(res.status).toBe(400);
      expect(res.body.error).toHaveProperty('code');
    });

    it('validates signature is not empty', async () => {
      const res = await request(app)
        .post('/api/v1/auth/verify')
        .send({
          stellarAddress,
          signature: '',
          challenge: 'some_challenge',
        });

      expect(res.status).toBe(400);
      expect(res.body.error).toHaveProperty('code');
    });
  });

  describe('GET /api/v1/auth/me', () => {
    it('returns user info with valid token', async () => {
      const mockPayload = {
        userId: 'user_123',
        stellarAddress,
      };
      vi.mocked(verifyAccessToken).mockReturnValue(mockPayload);
      vi.mocked(prisma.user.findUnique).mockResolvedValue({
        id: 'user_123',
        stellarAddress,
        username: null,
        createdAt: new Date(),
      });

      const res = await request(app)
        .get('/api/v1/auth/me')
        .set('Authorization', 'Bearer valid_token');

      expect(res.status).toBe(200);
    });

    it('rejects request without authorization header', async () => {
      const res = await request(app).get('/api/v1/auth/me');

      expect(res.status).toBe(401);
      expect(res.body.error).toHaveProperty('code', 'UNAUTHORIZED');
    });

    it('rejects request with invalid authorization header', async () => {
      const res = await request(app)
        .get('/api/v1/auth/me')
        .set('Authorization', 'InvalidFormat');

      expect(res.status).toBe(401);
      expect(res.body.error).toHaveProperty('code', 'UNAUTHORIZED');
    });

    it('rejects request with invalid token', async () => {
      vi.mocked(verifyAccessToken).mockImplementation(() => {
        throw new UnauthorizedError('Invalid token');
      });

      const res = await request(app)
        .get('/api/v1/auth/me')
        .set('Authorization', 'Bearer invalid_token');

      expect(res.status).toBe(401);
      expect(res.body.error).toHaveProperty('code', 'UNAUTHORIZED');
    });
  });

  describe('POST /api/v1/auth/refresh', () => {
    it('refreshes tokens with valid refresh token', async () => {
      const mockTokens = {
        accessToken: 'new_access_token',
        refreshToken: 'new_refresh_token',
      };
      vi.mocked(refreshTokens).mockResolvedValue(mockTokens);

      const res = await request(app)
        .post('/api/v1/auth/refresh')
        .send({ refreshToken: 'valid_refresh_token' });

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('accessToken');
      expect(res.body).toHaveProperty('refreshToken');
    });

    it('rejects invalid refresh token', async () => {
      vi.mocked(refreshTokens).mockImplementation(() => {
        throw new UnauthorizedError('Invalid refresh token');
      });

      const res = await request(app)
        .post('/api/v1/auth/refresh')
        .send({ refreshToken: 'invalid_token' });

      expect(res.status).toBe(401);
      expect(res.body.error).toHaveProperty('code', 'UNAUTHORIZED');
    });

    it('validates refreshToken is required', async () => {
      const res = await request(app)
        .post('/api/v1/auth/refresh')
        .send({});

      expect(res.status).toBe(400);
      expect(res.body.error).toHaveProperty('code');
    });
  });

  describe('POST /api/v1/auth/logout', () => {
    it('revokes refresh token on logout', async () => {
      vi.mocked(revokeRefreshToken).mockResolvedValue(undefined);

      const res = await request(app)
        .post('/api/v1/auth/logout')
        .send({ refreshToken: 'valid_refresh_token' });

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('message', 'Logged out successfully');
    });

    it('rejects invalid refresh token', async () => {
      vi.mocked(revokeRefreshToken).mockImplementation(() => {
        throw new UnauthorizedError('Invalid refresh token');
      });

      const res = await request(app)
        .post('/api/v1/auth/logout')
        .send({ refreshToken: 'invalid_token' });

      expect(res.status).toBe(401);
      expect(res.body.error).toHaveProperty('code', 'UNAUTHORIZED');
    });

    it('validates refreshToken is required', async () => {
      const res = await request(app)
        .post('/api/v1/auth/logout')
        .send({});

      expect(res.status).toBe(400);
      expect(res.body.error).toHaveProperty('code');
    });
  });

  describe('Complete Happy Path Flow', () => {
    it('completes full auth flow: challenge → verify → me → refresh → logout', async () => {
      // Step 1: Challenge
      const mockChallenge = {
        challenge: 'a'.repeat(64),
        expiresAt: new Date(Date.now() + 300000).toISOString(),
      };
      vi.mocked(createChallenge).mockResolvedValue(mockChallenge);

      const challengeRes = await request(app)
        .post('/api/v1/auth/challenge')
        .send({ stellarAddress });

      expect(challengeRes.status).toBe(200);
      const { challenge } = challengeRes.body;

      // Step 2: Verify
      const mockTokens = {
        accessToken: 'access_token_1',
        refreshToken: 'refresh_token_1',
      };
      vi.mocked(verifyChallenge).mockResolvedValue(mockTokens);

      const verifyRes = await request(app)
        .post('/api/v1/auth/verify')
        .send({
          stellarAddress,
          signature: 'test_signature',
          challenge,
        });

      expect(verifyRes.status).toBe(200);
      const { accessToken: token1, refreshToken: refresh1 } = verifyRes.body;

      // Step 3: Me
      const mockPayload = {
        userId: 'user_123',
        stellarAddress,
      };
      vi.mocked(verifyAccessToken).mockReturnValue(mockPayload);
      vi.mocked(prisma.user.findUnique).mockResolvedValue({
        id: 'user_123',
        stellarAddress,
        username: null,
        createdAt: new Date(),
      });

      const meRes = await request(app)
        .get('/api/v1/auth/me')
        .set('Authorization', `Bearer ${token1}`);

      expect(meRes.status).toBe(200);

      // Step 4: Refresh
      const mockNewTokens = {
        accessToken: 'access_token_2',
        refreshToken: 'refresh_token_2',
      };
      vi.mocked(refreshTokens).mockResolvedValue(mockNewTokens);

      const refreshRes = await request(app)
        .post('/api/v1/auth/refresh')
        .send({ refreshToken: refresh1 });

      expect(refreshRes.status).toBe(200);
      const { accessToken: token2, refreshToken: refresh2 } = refreshRes.body;

      // Verify new tokens are different
      expect(token2).not.toBe(token1);
      expect(refresh2).not.toBe(refresh1);

      // Step 5: Logout
      vi.mocked(revokeRefreshToken).mockResolvedValue(undefined);

      const logoutRes = await request(app)
        .post('/api/v1/auth/logout')
        .send({ refreshToken: refresh2 });

      expect(logoutRes.status).toBe(200);
    });
  });
});
