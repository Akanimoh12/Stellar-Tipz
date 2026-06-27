import request from 'supertest';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { createApp } from '../../app.js';

const {
  mockChallengeFindUnique,
  mockChallengeDelete,
  mockUserFindUnique,
  mockUserCreate,
  mockRefreshFindUnique,
  mockRefreshCreate,
  mockRefreshUpdate,
  mockRefreshDeleteMany,
  mockVerify,
} = vi.hoisted(() => ({
  mockChallengeFindUnique: vi.fn(),
  mockChallengeDelete: vi.fn(),
  mockUserFindUnique: vi.fn(),
  mockUserCreate: vi.fn(),
  mockRefreshFindUnique: vi.fn(),
  mockRefreshCreate: vi.fn(),
  mockRefreshUpdate: vi.fn(),
  mockRefreshDeleteMany: vi.fn(),
  mockVerify: vi.fn(),
}));

vi.mock('../../db/prisma.js', () => ({
  prisma: {
    authChallenge: {
      findUnique: mockChallengeFindUnique,
      delete: mockChallengeDelete,
    },
    user: {
      findUnique: mockUserFindUnique,
      create: mockUserCreate,
    },
    refreshToken: {
      findUnique: mockRefreshFindUnique,
      create: mockRefreshCreate,
      update: mockRefreshUpdate,
      deleteMany: mockRefreshDeleteMany,
    },
    $disconnect: vi.fn(),
  },
}));

vi.mock('@stellar/stellar-sdk', () => ({
  Keypair: {
    fromPublicKey: vi.fn(() => ({
      verify: mockVerify,
    })),
  },
}));

vi.mock('jsonwebtoken', () => ({
  default: {
    sign: vi.fn(() => 'mock-access-token'),
  },
  sign: vi.fn(() => 'mock-access-token'),
}));

describe('POST /api/v1/auth/verify', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 400 when inputs are missing', async () => {
    const app = createApp();
    const res = await request(app)
      .post('/api/v1/auth/verify')
      .send({});
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('returns 400 when challenge is not found', async () => {
    mockChallengeFindUnique.mockResolvedValue(null);

    const app = createApp();
    const res = await request(app)
      .post('/api/v1/auth/verify')
      .send({ address: 'GABC123', nonce: 'nonexistent', signature: 'abc' });
    expect(res.status).toBe(400);
    expect(res.body.error.message).toBe('Challenge not found');
  });

  it('returns 400 when challenge is expired', async () => {
    mockChallengeFindUnique.mockResolvedValue({
      id: 'ch-1',
      address: 'GABC123',
      nonce: 'nonce-1',
      expiresAt: new Date(Date.now() - 1000),
      createdAt: new Date(),
    });

    const app = createApp();
    const res = await request(app)
      .post('/api/v1/auth/verify')
      .send({ address: 'GABC123', nonce: 'nonce-1', signature: 'abc' });
    expect(res.status).toBe(400);
    expect(res.body.error.message).toBe('Challenge has expired');
  });

  it('returns 401 when signature is invalid', async () => {
    mockChallengeFindUnique.mockResolvedValue({
      id: 'ch-1',
      address: 'GABC123',
      nonce: 'nonce-1',
      expiresAt: new Date(Date.now() + 100000),
      createdAt: new Date(),
    });
    mockVerify.mockReturnValue(false);

    const app = createApp();
    const res = await request(app)
      .post('/api/v1/auth/verify')
      .send({ address: 'GABC123', nonce: 'nonce-1', signature: 'invalidsig' });
    expect(res.status).toBe(401);
    expect(res.body.error.message).toBe('Invalid signature');
  });

  it('returns tokens on successful verification', async () => {
    mockChallengeFindUnique.mockResolvedValue({
      id: 'ch-1',
      address: 'GABC123',
      nonce: 'nonce-1',
      expiresAt: new Date(Date.now() + 100000),
      createdAt: new Date(),
    });
    mockVerify.mockReturnValue(true);
    mockChallengeDelete.mockResolvedValue({});
    mockUserFindUnique.mockResolvedValue(null);
    mockUserCreate.mockResolvedValue({
      id: 'user-1',
      stellarAddress: 'GABC123',
      username: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const app = createApp();
    const res = await request(app)
      .post('/api/v1/auth/verify')
      .send({ address: 'GABC123', nonce: 'nonce-1', signature: 'validsig' });
    expect(res.status).toBe(200);
    expect(res.body.data.accessToken).toBe('mock-access-token');
    expect(res.body.data.refreshToken).toBeDefined();
    expect(res.body.data.user.stellarAddress).toBe('GABC123');
  });
});

describe('POST /api/v1/auth/refresh', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 400 when refresh token is missing', async () => {
    const app = createApp();
    const res = await request(app)
      .post('/api/v1/auth/refresh')
      .send({});
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('returns 401 when refresh token is not found', async () => {
    mockRefreshFindUnique.mockResolvedValue(null);

    const app = createApp();
    const res = await request(app)
      .post('/api/v1/auth/refresh')
      .send({ refreshToken: 'invalid' });
    expect(res.status).toBe(401);
    expect(res.body.error.message).toBe('Invalid refresh token');
  });

  it('returns 401 when refresh token is revoked', async () => {
    mockRefreshFindUnique.mockResolvedValue({
      id: 'rt-1',
      userId: 'user-1',
      hashedToken: 'hash',
      expiresAt: new Date(Date.now() + 100000),
      revokedAt: new Date(),
      createdAt: new Date(),
      user: { id: 'user-1', stellarAddress: 'GABC123', username: null },
    });

    const app = createApp();
    const res = await request(app)
      .post('/api/v1/auth/refresh')
      .send({ refreshToken: 'revoked-token' });
    expect(res.status).toBe(401);
    expect(res.body.error.message).toBe('Refresh token has been revoked');
  });

  it('returns tokens on successful refresh', async () => {
    mockRefreshFindUnique.mockResolvedValue({
      id: 'rt-1',
      userId: 'user-1',
      hashedToken: 'hash',
      expiresAt: new Date(Date.now() + 100000),
      revokedAt: null,
      createdAt: new Date(),
      user: { id: 'user-1', stellarAddress: 'GABC123', username: null },
    });
    mockRefreshUpdate.mockResolvedValue({});
    mockRefreshCreate.mockResolvedValue({});

    const app = createApp();
    const res = await request(app)
      .post('/api/v1/auth/refresh')
      .send({ refreshToken: 'valid-token' });
    expect(res.status).toBe(200);
    expect(res.body.data.accessToken).toBe('mock-access-token');
    expect(res.body.data.refreshToken).toBeDefined();
    expect(res.body.data.user.stellarAddress).toBe('GABC123');
  });
});
