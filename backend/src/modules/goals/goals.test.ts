import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp } from '../../app.js';
import * as goalsService from './goals.service.js';

const { mockFindMany, mockCount, mockFindUnique, mockCreate, mockUpdate, mockAuthMiddleware } = vi.hoisted(() => {
  const authMw = vi.fn((req, _res, next) => {
    req.auth = { userId: 'user-1', stellarAddress: 'GA1', role: 'user', scopes: [] };
    next();
  });
  return {
    mockFindMany: vi.fn(),
    mockCount: vi.fn(),
    mockFindUnique: vi.fn(),
    mockCreate: vi.fn(),
    mockUpdate: vi.fn(),
    mockAuthMiddleware: authMw,
  };
});

vi.mock('../../db/prisma.js', () => ({
  prisma: {
    goal: {
      findMany: mockFindMany,
      count: mockCount,
      findUnique: mockFindUnique,
      create: mockCreate,
      update: mockUpdate,
    },
    $disconnect: vi.fn(),
  },
}));

vi.mock('../auth/auth.middleware.js', () => ({
  authMiddleware: mockAuthMiddleware,
  requireAuth: mockAuthMiddleware,
  optionalAuth: vi.fn((_req, _res, next) => next()),
  requireRole: () => mockAuthMiddleware,
  requireScope: () => mockAuthMiddleware,
  requireAnyScope: () => mockAuthMiddleware,
}));

const mockGoal = {
  id: 'goal-1',
  userId: 'user-1',
  title: 'New Camera',
  targetStroops: BigInt('1000000000'),
  raisedStroops: BigInt('250000000'),
  deadline: new Date('2026-12-31T23:59:59Z'),
  status: 'ACTIVE',
  createdAt: new Date('2026-07-24T10:00:00Z'),
  updatedAt: new Date('2026-07-24T10:00:00Z'),
  deletedAt: null,
};

const mockGoalNoDeadline = {
  id: 'goal-2',
  userId: 'user-2',
  title: 'Art Supplies',
  targetStroops: BigInt('500000000'),
  raisedStroops: BigInt('0'),
  deadline: null,
  status: 'ACTIVE',
  createdAt: new Date('2026-07-25T10:00:00Z'),
  updatedAt: new Date('2026-07-25T10:00:00Z'),
  deletedAt: null,
};

describe('GET /api/v1/goals', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFindMany.mockResolvedValue([]);
    mockCount.mockResolvedValue(0);
  });

  it('returns 200 with empty data by default', async () => {
    const app = createApp();
    const res = await request(app).get('/api/v1/goals');

    expect(res.status).toBe(200);
    expect(res.body.data).toEqual([]);
    expect(res.body.pagination).toEqual({
      limit: 20,
      offset: 0,
      total: 0,
      hasMore: false,
    });
  });

  it('returns goals list with pagination', async () => {
    mockFindMany.mockResolvedValue([mockGoal]);
    mockCount.mockResolvedValue(1);

    const app = createApp();
    const res = await request(app).get('/api/v1/goals');

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].id).toBe('goal-1');
    expect(res.body.data[0].title).toBe('New Camera');
    expect(res.body.data[0].targetStroops).toBe('1000000000');
    expect(res.body.data[0].raisedStroops).toBe('250000000');
    expect(res.body.data[0].progress).toBe(25);
    expect(res.body.data[0].deadline).toBe('2026-12-31T23:59:59.000Z');
    expect(res.body.data[0].status).toBe('ACTIVE');
    expect(res.body.pagination).toEqual({
      limit: 20,
      offset: 0,
      total: 1,
      hasMore: false,
    });
  });

  it('filters by status', async () => {
    mockFindMany.mockResolvedValue([]);
    mockCount.mockResolvedValue(0);

    const app = createApp();
    await request(app).get('/api/v1/goals?status=ACTIVE');

    expect(mockFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ status: 'ACTIVE', deletedAt: null }),
      }),
    );
  });

  it('filters by userId', async () => {
    mockFindMany.mockResolvedValue([]);
    mockCount.mockResolvedValue(0);

    const app = createApp();
    await request(app).get('/api/v1/goals?userId=user-1');

    expect(mockFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ userId: 'user-1', deletedAt: null }),
      }),
    );
  });

  it('returns 400 for invalid status', async () => {
    const app = createApp();
    const res = await request(app).get('/api/v1/goals?status=INVALID');
    expect(res.status).toBe(400);
  });
});

describe('GET /api/v1/goals/:id', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns a goal by id', async () => {
    mockFindUnique.mockResolvedValue(mockGoal);

    const app = createApp();
    const res = await request(app).get('/api/v1/goals/goal-1');

    expect(res.status).toBe(200);
    expect(res.body.data.id).toBe('goal-1');
    expect(res.body.data.title).toBe('New Camera');
  });

  it('returns 404 when goal not found', async () => {
    mockFindUnique.mockResolvedValue(null);

    const app = createApp();
    const res = await request(app).get('/api/v1/goals/nonexistent');

    expect(res.status).toBe(404);
  });

  it('returns 404 when goal is soft-deleted', async () => {
    mockFindUnique.mockResolvedValue({ ...mockGoal, deletedAt: new Date() });

    const app = createApp();
    const res = await request(app).get('/api/v1/goals/goal-1');

    expect(res.status).toBe(404);
  });
});

describe('POST /api/v1/goals', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('creates a goal when authenticated', async () => {
    mockCreate.mockResolvedValue(mockGoal);

    const app = createApp();
    const res = await request(app)
      .post('/api/v1/goals')
      .set('Authorization', 'Bearer valid-token')
      .send({
        title: 'New Camera',
        targetStroops: '1000000000',
        deadline: '2026-12-31T23:59:59.000Z',
      });

    expect(res.status).toBe(201);
    expect(res.body.data.id).toBe('goal-1');
    expect(res.body.data.title).toBe('New Camera');
    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          userId: 'user-1',
          title: 'New Camera',
          targetStroops: BigInt('1000000000'),
        }),
      }),
    );
  });

  it('returns 400 for missing title', async () => {
    const app = createApp();
    const res = await request(app)
      .post('/api/v1/goals')
      .set('Authorization', 'Bearer valid-token')
      .send({ targetStroops: '1000000000' });

    expect(res.status).toBe(400);
  });

  it('returns 400 for invalid targetStroops', async () => {
    const app = createApp();
    const res = await request(app)
      .post('/api/v1/goals')
      .set('Authorization', 'Bearer valid-token')
      .send({ title: 'Test', targetStroops: 'not-a-number' });

    expect(res.status).toBe(400);
  });

  it('creates a goal without deadline', async () => {
    mockCreate.mockResolvedValue(mockGoalNoDeadline);

    const app = createApp();
    const res = await request(app)
      .post('/api/v1/goals')
      .set('Authorization', 'Bearer valid-token')
      .send({
        title: 'Art Supplies',
        targetStroops: '500000000',
      });

    expect(res.status).toBe(201);
    expect(res.body.data.title).toBe('Art Supplies');
    expect(res.body.data.deadline).toBeNull();
  });
});

describe('PUT /api/v1/goals/:id', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('updates a goal when owner', async () => {
    mockFindUnique.mockResolvedValue(mockGoal);
    mockUpdate.mockResolvedValue({ ...mockGoal, title: 'New Camera Pro', targetStroops: BigInt('2000000000') });

    const app = createApp();
    const res = await request(app)
      .put('/api/v1/goals/goal-1')
      .set('Authorization', 'Bearer valid-token')
      .send({ title: 'New Camera Pro', targetStroops: '2000000000' });

    expect(res.status).toBe(200);
    expect(res.body.data.title).toBe('New Camera Pro');
    expect(res.body.data.targetStroops).toBe('2000000000');
  });

  it('returns 404 when goal not found', async () => {
    mockFindUnique.mockResolvedValue(null);

    const app = createApp();
    const res = await request(app)
      .put('/api/v1/goals/nonexistent')
      .set('Authorization', 'Bearer valid-token')
      .send({ title: 'Updated' });

    expect(res.status).toBe(404);
  });

  it('returns 400 for empty title', async () => {
    const app = createApp();
    const res = await request(app)
      .put('/api/v1/goals/goal-1')
      .set('Authorization', 'Bearer valid-token')
      .send({ title: '' });

    expect(res.status).toBe(400);
  });
});

describe('DELETE /api/v1/goals/:id', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('deletes a goal when owner', async () => {
    mockFindUnique.mockResolvedValue(mockGoal);
    mockUpdate.mockResolvedValue({ ...mockGoal, deletedAt: new Date() });

    const app = createApp();
    const res = await request(app)
      .delete('/api/v1/goals/goal-1')
      .set('Authorization', 'Bearer valid-token');

    expect(res.status).toBe(204);
    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'goal-1' },
        data: expect.objectContaining({ deletedAt: expect.any(Date) }),
      }),
    );
  });

  it('returns 404 when goal not found', async () => {
    mockFindUnique.mockResolvedValue(null);

    const app = createApp();
    const res = await request(app)
      .delete('/api/v1/goals/nonexistent')
      .set('Authorization', 'Bearer valid-token');

    expect(res.status).toBe(404);
  });
});

describe('goalsService functions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('getGoals queries deletedAt null by default', async () => {
    mockFindMany.mockResolvedValue([]);
    mockCount.mockResolvedValue(0);

    await goalsService.getGoals(undefined, undefined, 20, 0);

    expect(mockFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { deletedAt: null },
      }),
    );
  });

  it('getGoals filters by both status and userId', async () => {
    mockFindMany.mockResolvedValue([]);
    mockCount.mockResolvedValue(0);

    await goalsService.getGoals('ACTIVE', 'user-1', 10, 0);

    expect(mockFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { deletedAt: null, status: 'ACTIVE', userId: 'user-1' },
        take: 10,
      }),
    );
  });
});
