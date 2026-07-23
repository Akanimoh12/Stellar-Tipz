import request from 'supertest';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { createApp } from '../../app.js';

const { mockFindMany, mockFindFirst } = vi.hoisted(() => ({
  mockFindMany: vi.fn(),
  mockFindFirst: vi.fn(),
}));

vi.mock('../../db/prisma.js', () => ({
  prisma: {
    leaderboardSnapshot: {
      findMany: mockFindMany,
      findFirst: mockFindFirst,
    },
    $disconnect: vi.fn(),
  },
}));

describe('GET /api/v1/leaderboard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 400 for invalid period', async () => {
    const app = createApp();
    const res = await request(app).get('/api/v1/leaderboard?period=INVALID');
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('returns empty leaderboard when no entries exist', async () => {
    mockFindMany.mockResolvedValue([]);

    const app = createApp();
    const res = await request(app).get('/api/v1/leaderboard');
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual([]);
    expect(res.body.period).toBe('ALL_TIME');
  });

  it('returns leaderboard entries sorted by rank', async () => {
    const now = new Date();
    mockFindMany.mockResolvedValue([
      {
        id: 'lb-1',
        period: 'ALL_TIME',
        rank: 1,
        userId: 'user-1',
        totalTips: BigInt(200_000_000),
        createdAt: now,
        updatedAt: now,
        user: { id: 'user-1', username: 'alice', stellarAddress: 'GA...1' },
      },
      {
        id: 'lb-2',
        period: 'ALL_TIME',
        rank: 2,
        userId: 'user-2',
        totalTips: BigInt(100_000_000),
        createdAt: now,
        updatedAt: now,
        user: { id: 'user-2', username: 'bob', stellarAddress: 'GA...2' },
      },
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
  });

  it('respects limit and offset params', async () => {
    mockFindMany.mockResolvedValue([]);

    const app = createApp();
    await request(app).get('/api/v1/leaderboard?limit=5&offset=10');
    expect(mockFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ take: 5, skip: 10 }),
    );
  });

  it('filters by MONTHLY period', async () => {
    mockFindMany.mockResolvedValue([]);

    const app = createApp();
    await request(app).get('/api/v1/leaderboard?period=MONTHLY');
    expect(mockFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { period: 'MONTHLY' } }),
    );
  });
});

describe('GET /api/v1/leaderboard/:userId', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 404 when user not on leaderboard', async () => {
    mockFindFirst.mockResolvedValue(null);

    const app = createApp();
    const res = await request(app).get('/api/v1/leaderboard/user-999');
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
  });

  it('returns user rank when found', async () => {
    mockFindFirst.mockResolvedValue({
      id: 'lb-1',
      period: 'ALL_TIME',
      rank: 5,
      userId: 'user-1',
      totalTips: BigInt(50_000_000),
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const app = createApp();
    const res = await request(app).get('/api/v1/leaderboard/user-1');
    expect(res.status).toBe(200);
    expect(res.body.data.rank).toBe(5);
    expect(res.body.data.totalTips).toBe('50000000');
  });

  it('accepts period query param', async () => {
    mockFindFirst.mockResolvedValue(null);

    const app = createApp();
    await request(app).get('/api/v1/leaderboard/user-1?period=WEEKLY');
    expect(mockFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: 'user-1', period: 'WEEKLY' } }),
    );
  });
});
