import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp } from '../../app.js';

const { mockUserFindUnique, mockTipFindUnique, mockRefundFindUnique, mockRefundFindMany, mockRefundCreate } =
  vi.hoisted(() => ({
    mockUserFindUnique: vi.fn(),
    mockTipFindUnique: vi.fn(),
    mockRefundFindUnique: vi.fn(),
    mockRefundFindMany: vi.fn(),
    mockRefundCreate: vi.fn(),
  }));

vi.mock('../../db/prisma.js', () => ({
  prisma: {
    user: { findUnique: mockUserFindUnique },
    tip: { findUnique: mockTipFindUnique },
    refund: {
      findUnique: mockRefundFindUnique,
      findMany: mockRefundFindMany,
      create: mockRefundCreate,
    },
    $disconnect: vi.fn(),
  },
}));

vi.mock('jsonwebtoken', () => ({
  default: { verify: vi.fn() },
}));

const jwt = await import('jsonwebtoken');
const address = 'GF5YV3FQRHRMA7IQWCZKGRRJ5P7CEPIVBQLM4X2FEHS2IU57KF3U4CLN';

function mockAuth(userId = 'user-1'): void {
  (jwt.default.verify as ReturnType<typeof vi.fn>).mockReturnValue({
    sub: userId,
    stellarAddress: address,
  });
}

describe('POST /api/v1/refunds/request', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 401 without an Authorization header', async () => {
    const app = createApp();
    const res = await request(app)
      .post('/api/v1/refunds/request')
      .send({ tipTxHash: 'tip-hash', reason: 'wrong creator' });

    expect(res.status).toBe(401);
  });

  it('returns 400 for an empty body', async () => {
    mockAuth();
    const app = createApp();
    const res = await request(app)
      .post('/api/v1/refunds/request')
      .set('Authorization', 'Bearer valid-token')
      .send({});

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('returns 404 when the tip does not exist', async () => {
    mockAuth();
    mockUserFindUnique.mockResolvedValue({ id: 'user-1', stellarAddress: address });
    mockTipFindUnique.mockResolvedValue(null);

    const app = createApp();
    const res = await request(app)
      .post('/api/v1/refunds/request')
      .set('Authorization', 'Bearer valid-token')
      .send({ tipTxHash: 'tip-hash', reason: 'wrong creator' });

    expect(res.status).toBe(404);
  });

  it("returns 403 when the tip was not sent by the authenticated user", async () => {
    mockAuth();
    mockUserFindUnique.mockResolvedValue({ id: 'user-1', stellarAddress: address });
    mockTipFindUnique.mockResolvedValue({
      id: 'tip-1',
      fromAddress: 'GDIFFERENTADDRESS',
      status: 'CONFIRMED',
      amountStroops: BigInt(1_000_000),
    });

    const app = createApp();
    const res = await request(app)
      .post('/api/v1/refunds/request')
      .set('Authorization', 'Bearer valid-token')
      .send({ tipTxHash: 'tip-hash', reason: 'wrong creator' });

    expect(res.status).toBe(403);
  });

  it('returns 400 when the tip is not confirmed', async () => {
    mockAuth();
    mockUserFindUnique.mockResolvedValue({ id: 'user-1', stellarAddress: address });
    mockTipFindUnique.mockResolvedValue({
      id: 'tip-1',
      fromAddress: address,
      status: 'PENDING',
      amountStroops: BigInt(1_000_000),
    });

    const app = createApp();
    const res = await request(app)
      .post('/api/v1/refunds/request')
      .set('Authorization', 'Bearer valid-token')
      .send({ tipTxHash: 'tip-hash', reason: 'wrong creator' });

    expect(res.status).toBe(400);
  });

  it('returns 409 when a refund has already been requested for the tip', async () => {
    mockAuth();
    mockUserFindUnique.mockResolvedValue({ id: 'user-1', stellarAddress: address });
    mockTipFindUnique.mockResolvedValue({
      id: 'tip-1',
      fromAddress: address,
      status: 'CONFIRMED',
      amountStroops: BigInt(1_000_000),
    });
    mockRefundFindUnique.mockResolvedValue({ id: 'refund-1', tipId: 'tip-1' });

    const app = createApp();
    const res = await request(app)
      .post('/api/v1/refunds/request')
      .set('Authorization', 'Bearer valid-token')
      .send({ tipTxHash: 'tip-hash', reason: 'wrong creator' });

    expect(res.status).toBe(409);
  });

  it('creates a pending refund for a confirmed tip sent by the authenticated user', async () => {
    mockAuth();
    mockUserFindUnique.mockResolvedValue({ id: 'user-1', stellarAddress: address });
    mockTipFindUnique.mockResolvedValue({
      id: 'tip-1',
      fromAddress: address,
      status: 'CONFIRMED',
      amountStroops: BigInt(1_000_000),
    });
    mockRefundFindUnique.mockResolvedValue(null);
    mockRefundCreate.mockResolvedValue({
      id: 'refund-1',
      tipId: 'tip-1',
      amount: BigInt(1_000_000),
      reason: 'wrong creator',
      status: 'pending',
      txHash: null,
      createdAt: new Date('2024-01-01T00:00:00.000Z'),
      updatedAt: new Date('2024-01-01T00:00:00.000Z'),
    });

    const app = createApp();
    const res = await request(app)
      .post('/api/v1/refunds/request')
      .set('Authorization', 'Bearer valid-token')
      .send({ tipTxHash: 'tip-hash', reason: 'wrong creator' });

    expect(res.status).toBe(201);
    expect(mockRefundCreate).toHaveBeenCalledWith({
      data: {
        tipId: 'tip-1',
        amount: BigInt(1_000_000),
        reason: 'wrong creator',
        status: 'pending',
      },
    });
    expect(res.body.data).toMatchObject({
      id: 'refund-1',
      tipId: 'tip-1',
      amount: '1000000',
      reason: 'wrong creator',
      status: 'pending',
      txHash: null,
    });
  });
});

describe('GET /api/v1/refunds/me', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 401 without an Authorization header', async () => {
    const app = createApp();
    const res = await request(app).get('/api/v1/refunds/me');
    expect(res.status).toBe(401);
  });

  it("returns the authenticated user's refund history", async () => {
    mockAuth();
    mockUserFindUnique.mockResolvedValue({ id: 'user-1', stellarAddress: address });
    mockRefundFindMany.mockResolvedValue([
      {
        id: 'refund-1',
        tipId: 'tip-1',
        amount: BigInt(1_000_000),
        reason: 'wrong creator',
        status: 'pending',
        txHash: null,
        createdAt: new Date('2024-01-01T00:00:00.000Z'),
        updatedAt: new Date('2024-01-01T00:00:00.000Z'),
      },
    ]);

    const app = createApp();
    const res = await request(app)
      .get('/api/v1/refunds/me')
      .set('Authorization', 'Bearer valid-token');

    expect(res.status).toBe(200);
    expect(res.body.data[0]).toMatchObject({
      id: 'refund-1',
      tipId: 'tip-1',
      amount: '1000000',
      status: 'pending',
    });
    expect(mockRefundFindMany).toHaveBeenCalledWith({
      where: { tip: { fromAddress: address } },
      orderBy: { createdAt: 'desc' },
      skip: 0,
      take: 20,
    });
  });

  it('returns an empty array when the user has no refunds', async () => {
    mockAuth();
    mockUserFindUnique.mockResolvedValue({ id: 'user-1', stellarAddress: address });
    mockRefundFindMany.mockResolvedValue([]);

    const app = createApp();
    const res = await request(app)
      .get('/api/v1/refunds/me')
      .set('Authorization', 'Bearer valid-token');

    expect(res.status).toBe(200);
    expect(res.body.data).toEqual([]);
  });
});
