/**
 * Tests for #835 (signAccessToken util) and #845 (GET /auth/me endpoint).
 *
 * The Prisma client and env are mocked so no real DB or env file is needed.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import jwt from 'jsonwebtoken';

// ── Mock env before any module that imports it ────────────────────────────────
vi.mock('@/config/env.js', () => ({
  env: {
    NODE_ENV: 'test',
    PORT: 4000,
    API_BASE_PATH: '/api/v1',
    CORS_ORIGIN: 'http://localhost:5173',
    JWT_SECRET: 'test-secret-key-for-vitest',
    JWT_EXPIRES_IN: '15m',
    REFRESH_TOKEN_EXPIRES_IN: '7d',
    AUTH_CHALLENGE_TTL_SECONDS: 300,
    LOG_LEVEL: 'silent',
  },
}));

// ── Mock Prisma so tests run without a real database ──────────────────────────
vi.mock('@/db/prisma.js', () => ({
  prisma: {
    user: {
      findUnique: vi.fn(),
    },
  },
}));

import { createApp } from '@/app.js';
import { prisma } from '@/db/prisma.js';
import { signAccessToken } from './auth.utils.js';

const TEST_SECRET = 'test-secret-key-for-vitest';

function makeToken(payload: object, secret = TEST_SECRET, options?: jwt.SignOptions): string {
  return jwt.sign(payload, secret, { expiresIn: '15m', ...options });
}

// ── #835 signAccessToken ──────────────────────────────────────────────────────

describe('signAccessToken (issue #835)', () => {
  it('returns a valid JWT with userId and stellarAddress claims', () => {
    const token = signAccessToken({ id: 'user_01', stellarAddress: 'GABC' });
    const decoded = jwt.verify(token, TEST_SECRET) as jwt.JwtPayload;
    expect(decoded['userId']).toBe('user_01');
    expect(decoded['stellarAddress']).toBe('GABC');
  });

  it('throws BadRequestError when id is empty', () => {
    expect(() => signAccessToken({ id: '', stellarAddress: 'GABC' })).toThrow();
  });

  it('throws BadRequestError when stellarAddress is empty', () => {
    expect(() => signAccessToken({ id: 'user_01', stellarAddress: '' })).toThrow();
  });

  it('produces a token with an expiry', () => {
    const token = signAccessToken({ id: 'user_01', stellarAddress: 'GABC' });
    const decoded = jwt.verify(token, TEST_SECRET) as jwt.JwtPayload;
    expect(decoded.exp).toBeDefined();
    expect(decoded.exp!).toBeGreaterThan(Math.floor(Date.now() / 1000));
  });
});

// ── #845 GET /auth/me ─────────────────────────────────────────────────────────

describe('GET /api/v1/auth/me (issue #845)', () => {
  const app = createApp();

  const fakeUser = {
    id: 'user_01',
    stellarAddress: 'GABC123',
    username: 'alice',
    createdAt: new Date('2024-01-01T00:00:00Z'),
    updatedAt: new Date('2024-06-01T00:00:00Z'),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ── success ───────────────────────────────────────────────────────────────

  it('returns 200 with the user summary for a valid token', async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValueOnce(fakeUser as never);

    const token = makeToken({ userId: 'user_01', stellarAddress: 'GABC123' });
    const res = await request(app)
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.data.id).toBe('user_01');
    expect(res.body.data.stellarAddress).toBe('GABC123');
    expect(res.body.data.username).toBe('alice');
    expect(res.body.data.createdAt).toBe('2024-01-01T00:00:00.000Z');
  });

  // ── auth failures ─────────────────────────────────────────────────────────

  it('returns 401 when Authorization header is missing', async () => {
    const res = await request(app).get('/api/v1/auth/me');
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('UNAUTHORIZED');
  });

  it('returns 401 when token is invalid', async () => {
    const res = await request(app)
      .get('/api/v1/auth/me')
      .set('Authorization', 'Bearer not.a.valid.token');
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('UNAUTHORIZED');
  });

  it('returns 401 when token is expired', async () => {
    const expired = makeToken({ userId: 'user_01', stellarAddress: 'GABC' }, TEST_SECRET, {
      expiresIn: -1,
    });
    const res = await request(app)
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${expired}`);
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('UNAUTHORIZED');
  });

  it('returns 401 when token is signed with the wrong secret', async () => {
    const wrongSecret = makeToken({ userId: 'user_01', stellarAddress: 'GABC' }, 'wrong-secret');
    const res = await request(app)
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${wrongSecret}`);
    expect(res.status).toBe(401);
  });

  // ── not found ─────────────────────────────────────────────────────────────

  it('returns 404 when the user no longer exists in the DB', async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValueOnce(null);

    const token = makeToken({ userId: 'ghost_user', stellarAddress: 'GABC' });
    const res = await request(app)
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
  });
});
