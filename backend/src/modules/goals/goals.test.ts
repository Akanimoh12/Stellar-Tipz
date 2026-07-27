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
