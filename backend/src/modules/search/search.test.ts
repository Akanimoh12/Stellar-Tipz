import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp } from '../../app.js';
import { searchCreators } from './search.service.js';

const { mockFindMany, mockCount, mockGroupBy, mockFindUnique } = vi.hoisted(() => ({
  mockFindMany: vi.fn(),
  mockCount: vi.fn(),
  mockGroupBy: vi.fn(),
  mockFindUnique: vi.fn(),
}));

vi.mock('../../db/prisma.js', () => ({
  prisma: {
    user: { findMany: mockFindMany, count: mockCount, findUnique: mockFindUnique },
    tip: { groupBy: mockGroupBy },
    $disconnect: vi.fn(),
  },
}));

describe('GET /api/v1/search/creators', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFindMany.mockResolvedValue([]);
    mockCount.mockResolvedValue(0);
  });

  it('returns 400 when q is missing', async () => {
    const app = createApp();
    const res = await request(app).get('/api/v1/search/creators');
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('returns 400 when q is empty', async () => {
    const app = createApp();
    const res = await request(app).get('/api/v1/search/creators?q=');
    expect(res.status).toBe(400);
  });

  it('returns matching creators', async () => {
    mockFindMany.mockResolvedValue([
      {
        id: 'user-1',
        username: 'alice',
        displayName: 'Alice Star',
        stellarAddress: 'GA1',
        imageUrl: null,
        bio: null,
      },
    ]);
    mockCount.mockResolvedValue(1);

    const app = createApp();
    const res = await request(app).get('/api/v1/search/creators?q=alice');

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].username).toBe('alice');
    expect(res.body.pagination).toEqual({
      limit: 20,
      offset: 0,
      total: 1,
      hasMore: false,
    });
  });

  it('applies limit and offset pagination', async () => {
    mockFindMany.mockResolvedValue([]);
    mockCount.mockResolvedValue(10);

    const app = createApp();
    const res = await request(app).get('/api/v1/search/creators?q=test&limit=5&offset=5');

    expect(res.status).toBe(200);
    expect(res.body.pagination).toEqual({
      limit: 5,
      offset: 5,
      total: 10,
      hasMore: true,
    });
  });

  it('returns 400 for invalid limit', async () => {
    const app = createApp();
    const res = await request(app).get('/api/v1/search/creators?q=test&limit=0');
    expect(res.status).toBe(400);
  });

  it('returns 400 for limit exceeding max', async () => {
    const app = createApp();
    const res = await request(app).get('/api/v1/search/creators?q=test&limit=100');
    expect(res.status).toBe(400);
  });
});

describe('searchCreators service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('queries with correct where clause', async () => {
    mockFindMany.mockResolvedValue([]);
    mockCount.mockResolvedValue(0);

    await searchCreators('bob', 20, 0);

    expect(mockFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          deletedAt: null,
          OR: [
            { username: { contains: 'bob', mode: 'insensitive' } },
            { displayName: { contains: 'bob', mode: 'insensitive' } },
          ],
        }),
        take: 20,
        skip: 0,
      }),
    );
  });
});

describe('GET /api/v1/search/trending', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGroupBy.mockResolvedValue([]);
    mockFindMany.mockResolvedValue([]);
    mockCount.mockResolvedValue(0);
  });

  it('returns 200 with empty data by default', async () => {
    const app = createApp();
    const res = await request(app).get('/api/v1/search/trending');

    expect(res.status).toBe(200);
    expect(res.body.data).toEqual([]);
    expect(res.body.window).toBe('7d');
    expect(res.body.pagination).toEqual({
      limit: 20,
      offset: 0,
      total: 0,
      hasMore: false,
    });
  });

  it('returns trending creators ranked by tip volume', async () => {
    mockGroupBy
      .mockResolvedValueOnce([
        { toAddress: 'GA1', _sum: { amountStroops: BigInt(500_000_000) }, _count: 42 },
        { toAddress: 'GA2', _sum: { amountStroops: BigInt(200_000_000) }, _count: 15 },
      ])
      .mockResolvedValueOnce([{}, {}]);
    mockFindMany.mockResolvedValue([
      { id: 'user-1', username: 'alice', displayName: 'Alice Star', stellarAddress: 'GA1', imageUrl: null, bio: 'Creator' },
      { id: 'user-2', username: 'bob', displayName: 'Bob Art', stellarAddress: 'GA2', imageUrl: null, bio: 'Artist' },
    ]);

    const app = createApp();
    const res = await request(app).get('/api/v1/search/trending');

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(2);
    expect(res.body.data[0]).toEqual({
      rank: 1,
      userId: 'user-1',
      username: 'alice',
      displayName: 'Alice Star',
      stellarAddress: 'GA1',
      imageUrl: null,
      bio: 'Creator',
      totalTipsStroops: '500000000',
      tipCount: 42,
    });
    expect(res.body.data[1]).toEqual({
      rank: 2,
      userId: 'user-2',
      username: 'bob',
      displayName: 'Bob Art',
      stellarAddress: 'GA2',
      imageUrl: null,
      bio: 'Artist',
      totalTipsStroops: '200000000',
      tipCount: 15,
    });
  });

  it('supports 24h window parameter', async () => {
    mockGroupBy.mockResolvedValue([]).mockResolvedValue([]);
    mockFindMany.mockResolvedValue([]);

    const app = createApp();
    const res = await request(app).get('/api/v1/search/trending?window=24h');

    expect(res.status).toBe(200);
    expect(res.body.window).toBe('24h');
  });

  it('returns 400 for invalid window', async () => {
    const app = createApp();
    const res = await request(app).get('/api/v1/search/trending?window=1y');

    expect(res.status).toBe(400);
  });

  it('returns 400 for invalid limit', async () => {
    const app = createApp();
    const res = await request(app).get('/api/v1/search/trending?limit=0');
    expect(res.status).toBe(400);
  });
});
