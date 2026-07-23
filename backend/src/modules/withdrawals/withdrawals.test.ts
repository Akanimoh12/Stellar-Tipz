import request from 'supertest';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { createApp } from '../../app.js';

const { mockFindMany } = vi.hoisted(() => ({
  mockFindMany: vi.fn(),
}));

vi.mock('../../db/prisma.js', () => ({
  prisma: {
    withdrawal: {
      findMany: mockFindMany,
    },
    $disconnect: vi.fn(),
  },
}));

vi.mock('jsonwebtoken', () => ({
  default: {
    verify: vi.fn(),
  },
}));

const jwt = await import('jsonwebtoken');

describe('GET /api/v1/withdrawals/me', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 401 without an Authorization header', async () => {
    const app = createApp();
    const res = await request(app).get('/api/v1/withdrawals/me');
    expect(res.status).toBe(401);
  });

  it('returns the authenticated user\'s withdrawal history', async () => {
    (jwt.default.verify as ReturnType<typeof vi.fn>).mockReturnValue({
      sub: 'user-1',
      stellarAddress: 'GABC123',
    });
    mockFindMany.mockResolvedValue([
      {
        id: 'wd-1',
        userId: 'user-1',
        amount: BigInt(1_000_000),
        fee: BigInt(1_000),
        txHash: 'tx-1',
        status: 'CONFIRMED',
        requestedAt: new Date('2024-01-01T00:00:00.000Z'),
        confirmedAt: new Date('2024-01-01T00:05:00.000Z'),
      },
    ]);

    const app = createApp();
    const res = await request(app)
      .get('/api/v1/withdrawals/me')
      .set('Authorization', 'Bearer valid-token');

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0]).toMatchObject({
      id: 'wd-1',
      amount: '1000000',
      fee: '1000',
      status: 'CONFIRMED',
    });
    expect(mockFindMany).toHaveBeenCalledWith({
      where: { userId: 'user-1' },
      orderBy: { requestedAt: 'desc' },
      skip: 0,
      take: 20,
    });
  });

  it('returns an empty list when the user has no withdrawals', async () => {
    (jwt.default.verify as ReturnType<typeof vi.fn>).mockReturnValue({
      sub: 'user-2',
      stellarAddress: 'GDEF456',
    });
    mockFindMany.mockResolvedValue([]);

    const app = createApp();
    const res = await request(app)
      .get('/api/v1/withdrawals/me')
      .set('Authorization', 'Bearer valid-token');

    expect(res.status).toBe(200);
    expect(res.body.data).toEqual([]);
  });
});
