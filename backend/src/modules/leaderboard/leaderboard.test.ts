import request from 'supertest';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { createApp } from '../../app.js';

const { mockGroupBy, mockFindMany, mockFindUnique } = vi.hoisted(() => ({
  mockGroupBy: vi.fn(),
  mockFindMany: vi.fn(),
  mockFindUnique: vi.fn(),
}));

vi.mock('../../db/prisma.js', () => ({
  prisma: {
    tip: {
      groupBy: mockGroupBy,
    },
    user: {
      findMany: mockFindMany,
      findUnique: mockFindUnique,
    },
    $disconnect: vi.fn(),
  },
}));

describe('GET /api/v1/leaderboard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 400 for invalid window', async () => {
    const app = createApp();
    const res = await request(app).get('/api/v1/leaderboard?window=INVALID');
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('returns empty leaderboard when no tips exist', async () => {
    mockGroupBy.mockResolvedValue([]);
    mockFindMany.mockResolvedValue([]);

    const app = createApp();
    const res = await request(app).get('/api/v1/leaderboard');
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual([]);
    expect(res.body.window).toBe('all');
  });

  it('defaults to all-time window when not specified', async () => {
    mockGroupBy.mockResolvedValue([]);
    mockFindMany.mockResolvedValue([]);

    const app = createApp();
    const res = await request(app).get('/api/v1/leaderboard');
    expect(res.status).toBe(200);
    expect(mockGroupBy).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { status: 'CONFIRMED' },
      }),
    );
  });

  it('filters by 24h window', async () => {
    mockGroupBy.mockResolvedValue([]);
    mockFindMany.mockResolvedValue([]);

    const app = createApp();
    await request(app).get('/api/v1/leaderboard?window=24h');
    expect(mockGroupBy).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          status: 'CONFIRMED',
          createdAt: { gte: expect.any(Date) },
        }),
      }),
    );
  });

  it('filters by 7d window', async () => {
    mockGroupBy.mockResolvedValue([]);
    mockFindMany.mockResolvedValue([]);

    const app = createApp();
    await request(app).get('/api/v1/leaderboard?window=7d');
    expect(mockGroupBy).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          status: 'CONFIRMED',
          createdAt: { gte: expect.any(Date) },
        }),
      }),
    );
  });

  it('returns leaderboard entries sorted by total tips descending', async () => {
    mockGroupBy.mockResolvedValue([
      { toAddress: 'GA...1', _sum: { amountStroops: BigInt(200_000_000) } },
      { toAddress: 'GA...2', _sum: { amountStroops: BigInt(100_000_000) } },
    ]);
    mockFindMany.mockResolvedValue([
      { id: 'user-1', username: 'alice', stellarAddress: 'GA...1' },
      { id: 'user-2', username: 'bob', stellarAddress: 'GA...2' },
    ]);

    const app = createApp();
    const res = await request(app).get('/api/v1/leaderboard');
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(2);
    expect(res.body.data[0].rank).toBe(1);
    expect(res.body.data[0].username).toBe('alice');
    expect(res.body.data[0].totalTips).toBe('200000000');
    expect(res.body.data[1].rank).toBe(2);
    expect(res.body.data[1].username).toBe('bob');
    expect(res.body.window).toBe('all');
  });

  it('respects limit and offset params', async () => {
    mockGroupBy.mockResolvedValue([]);
    mockFindMany.mockResolvedValue([]);

    const app = createApp();
    await request(app).get('/api/v1/leaderboard?limit=5&offset=10');
    expect(mockGroupBy).toHaveBeenCalledWith(
      expect.objectContaining({ take: 5, skip: 10 }),
    );
  });

  it('returns unknown user data when user not found in DB', async () => {
    mockGroupBy.mockResolvedValue([
      { toAddress: 'GA...1', _sum: { amountStroops: BigInt(50_000_000) } },
    ]);
    mockFindMany.mockResolvedValue([]);

    const app = createApp();
    const res = await request(app).get('/api/v1/leaderboard');
    expect(res.status).toBe(200);
    expect(res.body.data[0].userId).toBe('');
    expect(res.body.data[0].username).toBeNull();
  });
});

describe('GET /api/v1/leaderboard/:userId', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 404 when user not found', async () => {
    mockFindUnique.mockResolvedValue(null);

    const app = createApp();
    const res = await request(app).get('/api/v1/leaderboard/user-999');
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
  });

  it('returns 404 when user has no tips in window', async () => {
    mockFindUnique.mockResolvedValue({ id: 'user-1', stellarAddress: 'GA...1' });
    mockGroupBy.mockResolvedValue([]);

    const app = createApp();
    const res = await request(app).get('/api/v1/leaderboard/user-1');
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
  });

  it('returns user rank when found', async () => {
    mockFindUnique.mockResolvedValue({ id: 'user-1', stellarAddress: 'GA...1' });
    mockGroupBy.mockResolvedValue([
      { toAddress: 'GA...1', _sum: { amountStroops: BigInt(50_000_000) } },
      { toAddress: 'GA...2', _sum: { amountStroops: BigInt(30_000_000) } },
    ]);

    const app = createApp();
    const res = await request(app).get('/api/v1/leaderboard/user-1');
    expect(res.status).toBe(200);
    expect(res.body.data.rank).toBe(1);
    expect(res.body.data.totalTips).toBe('50000000');
    expect(res.body.data.window).toBe('all');
  });

  it('accepts window query param for user rank', async () => {
    mockFindUnique.mockResolvedValue({ id: 'user-1', stellarAddress: 'GA...1' });
    mockGroupBy.mockResolvedValue([]);

    const app = createApp();
    const res = await request(app).get('/api/v1/leaderboard/user-1?window=7d');
    expect(res.status).toBe(404);
    expect(mockGroupBy).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          status: 'CONFIRMED',
          createdAt: { gte: expect.any(Date) },
        }),
      }),
    );
  });

  it('returns rank 2 when user is second', async () => {
    mockFindUnique.mockResolvedValue({ id: 'user-2', stellarAddress: 'GA...2' });
    mockGroupBy.mockResolvedValue([
      { toAddress: 'GA...1', _sum: { amountStroops: BigInt(100_000_000) } },
      { toAddress: 'GA...2', _sum: { amountStroops: BigInt(50_000_000) } },
    ]);

    const app = createApp();
    const res = await request(app).get('/api/v1/leaderboard/user-2');
    expect(res.status).toBe(200);
    expect(res.body.data.rank).toBe(2);
  });
});
