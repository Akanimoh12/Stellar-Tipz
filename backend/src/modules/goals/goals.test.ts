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
/**
 * Unit tests for the goals module.
 *
 * Tests cover CRUD operations, progress calculation, and completion
 * detection + notification.
 *
 * Pure formula functions are tested without DB mocks; DB-backed service
 * functions use Vitest mocks following the credit module pattern.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Mock env & Prisma so no real DB is needed ─────────────────────────────────
vi.mock('@/config/env.js', () => ({
  env: {
    NODE_ENV: 'test',
    PORT: 4000,
    API_BASE_PATH: '/api/v1',
    CORS_ORIGIN: 'http://localhost:5173',
    JWT_SECRET: 'test-secret',
    JWT_EXPIRES_IN: '15m',
    REFRESH_TOKEN_EXPIRES_IN: '7d',
    AUTH_CHALLENGE_TTL_SECONDS: 300,
    LOG_LEVEL: 'silent',
  },
}));

vi.mock('@/db/prisma.js', () => ({
  prisma: {
    goal: {
      create: vi.fn(),
      findUnique: vi.fn(),
      findMany: vi.fn(),
      count: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    notification: {
      create: vi.fn(),
    },
  },
}));

import {
  calculateProgress,
  createGoal,
  getGoalById,
  getGoalsByUser,
  updateGoal,
  deleteGoal,
  getGoalProgress,
  checkAndNotifyCompletion,
} from './goals.service.js';
import { prisma } from '@/db/prisma.js';

// ── Helpers ───────────────────────────────────────────────────────────────────

const mockGoalRow = (overrides: Record<string, unknown> = {}) => ({
  id: 'goal_01',
  userId: 'user_01',
  title: 'New streaming setup',
  targetStroops: 10000000n,
  raisedStroops: 0n,
  deadline: null,
  status: 'ACTIVE',
  createdAt: new Date('2026-01-01T00:00:00Z'),
  updatedAt: new Date('2026-01-01T00:00:00Z'),
  ...overrides,
});

// ── Issue #1: calculateProgress (pure function) ───────────────────────────────

describe('calculateProgress', () => {
  it('returns 0% when nothing raised', () => {
    const result = calculateProgress('10000000', '0', null);
    expect(result.raisedPercentage).toBe(0);
    expect(result.isComplete).toBe(false);
    expect(result.daysRemaining).toBeNull();
  });

  it('returns 50% when half raised', () => {
    const result = calculateProgress('10000000', '5000000', null);
    expect(result.raisedPercentage).toBe(50);
    expect(result.isComplete).toBe(false);
  });

  it('returns 100% when target met', () => {
    const result = calculateProgress('10000000', '10000000', null);
    expect(result.raisedPercentage).toBe(100);
    expect(result.isComplete).toBe(true);
  });

  it('caps at 100% when over target', () => {
    const result = calculateProgress('10000000', '15000000', null);
    expect(result.raisedPercentage).toBe(100);
    expect(result.isComplete).toBe(true);
  });

  it('returns 0% when target is 0 (guard)', () => {
    const result = calculateProgress('0', '5000', null);
    expect(result.raisedPercentage).toBe(0);
    expect(result.isComplete).toBe(true);
  });

  it('calculates daysRemaining when deadline given', () => {
    const future = new Date(Date.now() + 3 * 86_400_000).toISOString();
    const result = calculateProgress('10000000', '0', future);
    expect(result.daysRemaining).toBe(3);
  });

  it('returns 0 daysRemaining for past deadline', () => {
    const past = new Date('2020-01-01').toISOString();
    const result = calculateProgress('10000000', '0', past);
    expect(result.daysRemaining).toBe(0);
  });
});

// ── Issue #1: createGoal (DB-backed, mocked) ───────────────────────────────────

describe('createGoal', () => {
  beforeEach(() => vi.clearAllMocks());

  it('creates and returns a goal', async () => {
    vi.mocked(prisma.goal.create).mockResolvedValueOnce(mockGoalRow() as never);

    const goal = await createGoal('user_01', {
      title: 'New streaming setup',
      targetStroops: '10000000',
    });

    expect(goal.id).toBe('goal_01');
    expect(goal.userId).toBe('user_01');
    expect(goal.title).toBe('New streaming setup');
    expect(goal.targetStroops).toBe('10000000');
    expect(goal.raisedStroops).toBe('0');
    expect(goal.status).toBe('ACTIVE');
  });
});

// ── Issue #1: getGoalById (DB-backed, mocked) ─────────────────────────────────

describe('getGoalById', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns a goal when found', async () => {
    vi.mocked(prisma.goal.findUnique).mockResolvedValueOnce(mockGoalRow() as never);

    const goal = await getGoalById('goal_01');
    expect(goal.id).toBe('goal_01');
  });

  it('throws NotFoundError when goal does not exist', async () => {
    vi.mocked(prisma.goal.findUnique).mockResolvedValueOnce(null);

    await expect(getGoalById('ghost')).rejects.toMatchObject({ statusCode: 404 });
  });
});

// ── Issue #1: getGoalsByUser (DB-backed, mocked) ─────────────────────────────

describe('getGoalsByUser', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns paginated goals for a user', async () => {
    vi.mocked(prisma.goal.findMany).mockResolvedValueOnce([mockGoalRow()] as never);
    vi.mocked(prisma.goal.count).mockResolvedValueOnce(1 as never);

    const result = await getGoalsByUser('user_01', 1, 20);

    expect(result.data).toHaveLength(1);
    expect(result.total).toBe(1);
    expect(result.page).toBe(1);
    expect(result.limit).toBe(20);
  });

  it('returns empty list when user has no goals', async () => {
    vi.mocked(prisma.goal.findMany).mockResolvedValueOnce([] as never);
    vi.mocked(prisma.goal.count).mockResolvedValueOnce(0 as never);

    const result = await getGoalsByUser('user_01', 1, 20);
    expect(result.data).toHaveLength(0);
    expect(result.total).toBe(0);
  });
});

// ── Issue #1: updateGoal (DB-backed, mocked) ─────────────────────────────────

describe('updateGoal', () => {
  beforeEach(() => vi.clearAllMocks());

  it('updates and returns the goal', async () => {
    vi.mocked(prisma.goal.findUnique).mockResolvedValueOnce(mockGoalRow() as never);
    vi.mocked(prisma.goal.update).mockResolvedValueOnce(
      mockGoalRow({ title: 'Updated title' }) as never,
    );
    // Completion check will find the goal again
    vi.mocked(prisma.goal.findUnique).mockResolvedValueOnce(
      mockGoalRow({ title: 'Updated title' }) as never,
    );

    const goal = await updateGoal('goal_01', { title: 'Updated title' });

    expect(goal.title).toBe('Updated title');
  });

  it('throws NotFoundError when goal does not exist', async () => {
    vi.mocked(prisma.goal.findUnique).mockResolvedValueOnce(null);

    await expect(updateGoal('ghost', { title: 'x' })).rejects.toMatchObject({
      statusCode: 404,
    });
  });
});

// ── Issue #1: deleteGoal (DB-backed, mocked) ─────────────────────────────────

describe('deleteGoal', () => {
  beforeEach(() => vi.clearAllMocks());

  it('deletes an existing goal', async () => {
    vi.mocked(prisma.goal.findUnique).mockResolvedValueOnce(mockGoalRow() as never);
    vi.mocked(prisma.goal.delete).mockResolvedValueOnce(mockGoalRow() as never);

    await expect(deleteGoal('goal_01')).resolves.toBeUndefined();
  });

  it('throws NotFoundError when goal does not exist', async () => {
    vi.mocked(prisma.goal.findUnique).mockResolvedValueOnce(null);

    await expect(deleteGoal('ghost')).rejects.toMatchObject({ statusCode: 404 });
  });
});

// ── Issue #2: getGoalProgress (DB-backed, mocked) ────────────────────────────

describe('getGoalProgress', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns progress for a goal', async () => {
    vi.mocked(prisma.goal.findUnique).mockResolvedValueOnce(mockGoalRow() as never);

    const progress = await getGoalProgress('goal_01');
    expect(progress.raisedPercentage).toBe(0);
    expect(progress.isComplete).toBe(false);
    expect(progress.daysRemaining).toBeNull();
    expect(progress.title).toBe('New streaming setup');
  });

  it('returns 100% when goal is fully raised', async () => {
    vi.mocked(prisma.goal.findUnique).mockResolvedValueOnce(
      mockGoalRow({ raisedStroops: 10000000n }) as never,
    );

    const progress = await getGoalProgress('goal_01');
    expect(progress.raisedPercentage).toBe(100);
    expect(progress.isComplete).toBe(true);
  });

  it('throws NotFoundError when goal does not exist', async () => {
    vi.mocked(prisma.goal.findUnique).mockResolvedValueOnce(null);

    await expect(getGoalProgress('ghost')).rejects.toMatchObject({ statusCode: 404 });
  });
});

// ── Issue #3: checkAndNotifyCompletion (DB-backed, mocked) ───────────────────

describe('checkAndNotifyCompletion', () => {
  beforeEach(() => vi.clearAllMocks());

  it('completes goal and creates notification when threshold met', async () => {
    vi.mocked(prisma.goal.findUnique).mockResolvedValueOnce(
      mockGoalRow({ raisedStroops: 10000000n }) as never,
    );
    vi.mocked(prisma.goal.update).mockResolvedValueOnce(
      mockGoalRow({ raisedStroops: 10000000n, status: 'COMPLETED' }) as never,
    );
    vi.mocked(prisma.notification.create).mockResolvedValueOnce({ id: 'notif_01' } as never);

    const goal = await checkAndNotifyCompletion('goal_01');

    expect(goal.status).toBe('COMPLETED');
    expect(prisma.notification.create).toHaveBeenCalledOnce();
    expect(prisma.notification.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          userId: 'user_01',
          type: 'GOAL_COMPLETED',
        }),
      }),
    );
  });

  it('does nothing when goal is not yet complete', async () => {
    vi.mocked(prisma.goal.findUnique).mockResolvedValueOnce(
      mockGoalRow({ raisedStroops: 5000000n }) as never,
    );

    const goal = await checkAndNotifyCompletion('goal_01');

    expect(goal.status).toBe('ACTIVE');
    expect(prisma.notification.create).not.toHaveBeenCalled();
  });

  it('does nothing when goal is already COMPLETED', async () => {
    vi.mocked(prisma.goal.findUnique).mockResolvedValueOnce(
      mockGoalRow({ status: 'COMPLETED', raisedStroops: 10000000n }) as never,
    );

    const goal = await checkAndNotifyCompletion('goal_01');

    expect(goal.status).toBe('COMPLETED');
    expect(prisma.notification.create).not.toHaveBeenCalled();
  });

  it('does nothing when goal is CANCELLED', async () => {
    vi.mocked(prisma.goal.findUnique).mockResolvedValueOnce(
      mockGoalRow({ status: 'CANCELLED' }) as never,
    );

    const goal = await checkAndNotifyCompletion('goal_01');
    expect(goal.status).toBe('CANCELLED');
    expect(prisma.notification.create).not.toHaveBeenCalled();
  });
});
