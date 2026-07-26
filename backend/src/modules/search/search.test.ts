import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp } from '../../app.js';
import { searchCreators } from './search.service.js';

const { mockFindMany, mockCount, mockQueryRaw } = vi.hoisted(() => ({
  mockFindMany: vi.fn(),
  mockCount: vi.fn(),
  mockQueryRaw: vi.fn(),
}));

vi.mock('../../db/prisma.js', () => ({
  prisma: {
    user: { findMany: mockFindMany, count: mockCount },
    $queryRaw: mockQueryRaw,
    $disconnect: vi.fn(),
  },
}));

describe('GET /api/v1/search/creators', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFindMany.mockResolvedValue([]);
    mockCount.mockResolvedValue(0);
    mockQueryRaw.mockResolvedValue([]);
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

  it('returns matching creators with relevance sort (default)', async () => {
    mockQueryRaw.mockResolvedValue([
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
    const res = await request(app).get('/api/v1/search/creators?q=test&limit=5&offset=5&sort=recent');

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

  it('returns 400 for invalid sort value', async () => {
    const app = createApp();
    const res = await request(app).get('/api/v1/search/creators?q=alice&sort=invalid');
    expect(res.status).toBe(400);
  });

  it('uses relevance ranking when sort=relevance', async () => {
    mockQueryRaw.mockResolvedValue([
      {
        id: 'user-1',
        username: 'alice',
        displayName: 'Alice Star',
        stellarAddress: 'GA1',
        imageUrl: null,
        bio: 'Alice bio',
      },
    ]);
    mockCount.mockResolvedValue(1);

    const app = createApp();
    const res = await request(app).get('/api/v1/search/creators?q=alice&sort=relevance');

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(mockQueryRaw).toHaveBeenCalled();
  });

  it('uses recent sort when sort=recent', async () => {
    mockFindMany.mockResolvedValue([]);
    mockCount.mockResolvedValue(0);

    const app = createApp();
    await request(app).get('/api/v1/search/creators?q=test&sort=recent');

    expect(mockFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        orderBy: [{ createdAt: 'desc' }],
      }),
    );
  });
});

describe('searchCreators service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('queries with correct where clause for recent sort', async () => {
    mockFindMany.mockResolvedValue([]);
    mockCount.mockResolvedValue(0);

    await searchCreators('bob', 20, 0, 'recent');

    expect(mockFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          deletedAt: null,
          OR: [
            { username: { contains: 'bob', mode: 'insensitive' } },
            { displayName: { contains: 'bob', mode: 'insensitive' } },
          ],
        }),
        orderBy: [{ createdAt: 'desc' }],
        take: 20,
        skip: 0,
      }),
    );
  });
});
