import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp } from '../../app.js';
import { createLeaderboardSnapshot, getLeaderboard } from './leaderboard.service.js';

const {
  mockGroupBy,
  mockFindMany,
  mockFindUnique,
  mockDeleteMany,
  mockCreateMany,
  mockTransaction,
} = vi.hoisted(() => ({
  mockGroupBy: vi.fn(),
  mockFindMany: vi.fn(),
  mockFindUnique: vi.fn(),
  mockDeleteMany: vi.fn(),
  mockCreateMany: vi.fn(),
  mockTransaction: vi.fn(),
}));

vi.mock('../../db/prisma.js', () => ({
  prisma: {
    tip: { groupBy: mockGroupBy },
    user: { findMany: mockFindMany, findUnique: mockFindUnique },
    leaderboardSnapshot: {
      deleteMany: mockDeleteMany,
      createMany: mockCreateMany,
    },
    $transaction: mockTransaction,
    $disconnect: vi.fn(),
  },
}));

describe('GET /api/v1/leaderboard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGroupBy.mockResolvedValue([]);
    mockFindMany.mockResolvedValue([]);
  });

  it('returns 400 for invalid window', async () => {
    const app = createApp();
    const res = await request(app).get('/api/v1/leaderboard?window=INVALID');
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('returns creators ranked by confirmed tip volume', async () => {
    mockGroupBy
      .mockResolvedValueOnce([
        { toAddress: 'GA1', _sum: { amountStroops: BigInt(200_000_000) } },
        { toAddress: 'GA2', _sum: { amountStroops: BigInt(100_000_000) } },
      ])
      .mockResolvedValueOnce([{}, {}]);
    mockFindMany.mockResolvedValue([
      { id: 'user-1', username: 'alice', stellarAddress: 'GA1' },
      { id: 'user-2', username: 'bob', stellarAddress: 'GA2' },
    ]);

    const app = createApp();
    const res = await request(app).get('/api/v1/leaderboard');

    expect(res.status).toBe(200);
    expect(res.body.data).toEqual([
      {
        rank: 1,
        userId: 'user-1',
        username: 'alice',
        stellarAddress: 'GA1',
        totalTips: '200000000',
      },
      {
        rank: 2,
        userId: 'user-2',
        username: 'bob',
        stellarAddress: 'GA2',
        totalTips: '100000000',
      },
    ]);
    expect(mockGroupBy).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { status: 'CONFIRMED' },
        orderBy: { _sum: { amountStroops: 'desc' } },
      }),
    );
  });

  it('returns pagination metadata', async () => {
    mockGroupBy
      .mockResolvedValueOnce([{ toAddress: 'GA1', _sum: { amountStroops: BigInt(1) } }])
      .mockResolvedValueOnce([{}, {}, {}]);
    mockFindMany.mockResolvedValue([{ id: 'user-1', username: 'alice', stellarAddress: 'GA1' }]);

    const result = await getLeaderboard('all', 1, 1);

    expect(result.pagination).toEqual({ limit: 1, offset: 1, total: 3, hasMore: true });
    expect(result.data[0].rank).toBe(2);
  });

  it('filters by 24h window', async () => {
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
});

describe('GET /api/v1/leaderboard/:userId', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns user rank when found', async () => {
    mockFindUnique.mockResolvedValue({ stellarAddress: 'GA2' });
    mockGroupBy.mockResolvedValue([
      { toAddress: 'GA1', _sum: { amountStroops: BigInt(100) } },
      { toAddress: 'GA2', _sum: { amountStroops: BigInt(50) } },
    ]);

    const app = createApp();
    const res = await request(app).get('/api/v1/leaderboard/user-2');

    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({ rank: 2, totalTips: '50', window: 'all' });
  });
});

describe('createLeaderboardSnapshot', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDeleteMany.mockReturnValue({ kind: 'delete' });
    mockCreateMany.mockReturnValue({ kind: 'create' });
    mockTransaction.mockResolvedValue([]);
  });

  it('rebuilds a period snapshot from ranked volume rows', async () => {
    mockGroupBy.mockResolvedValue([
      { toAddress: 'GA1', _sum: { amountStroops: BigInt(100) } },
      { toAddress: 'GA2', _sum: { amountStroops: BigInt(50) } },
    ]);
    mockFindMany.mockResolvedValue([
      { id: 'user-1', stellarAddress: 'GA1' },
      { id: 'user-2', stellarAddress: 'GA2' },
    ]);

    const result = await createLeaderboardSnapshot('WEEKLY', new Date('2026-07-24T00:00:00Z'));

    expect(result).toEqual({ period: 'WEEKLY', entriesCreated: 2 });
    expect(mockDeleteMany).toHaveBeenCalledWith({ where: { period: 'WEEKLY' } });
    expect(mockCreateMany).toHaveBeenCalledWith({
      data: [
        { period: 'WEEKLY', rank: 1, userId: 'user-1', totalTips: BigInt(100) },
        { period: 'WEEKLY', rank: 2, userId: 'user-2', totalTips: BigInt(50) },
      ],
    });
  });
});
