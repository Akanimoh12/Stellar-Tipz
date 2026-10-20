import request from 'supertest';
import { beforeEach, describe, expect, it, vi, afterEach } from 'vitest';
import { createApp } from '../../app.js';
import {
  computeCreditScore,
  getCreditScoreByUsername,
  recalculateCreditScore,
  scheduleRecomputeCreditScore,
} from './credit.service.js';
import { recalculate as recalculateController } from './credit.controller.js';

const {
  mockFindUnique,
  mockAggregate,
  mockUpsert,
  mockCreate,
  mockHistoryFindMany,
  mockRedisGet,
  mockRedisSet,
  mockTransaction,
} = vi.hoisted(() => ({
  mockFindUnique: vi.fn(),
  mockAggregate: vi.fn(),
  mockUpsert: vi.fn(),
  mockCreate: vi.fn(),
  mockHistoryFindMany: vi.fn(),
  mockRedisGet: vi.fn(),
  mockRedisSet: vi.fn(),
  mockTransaction: vi.fn(async (fn: (tx: unknown) => unknown) => {
    const tx = {
      creditScore: { upsert: mockUpsert },
      creditScoreHistory: { create: mockCreate },
    };
    return fn(tx);
  }),
}));

vi.mock('../../db/prisma.js', () => ({
  prisma: {
    user: { findUnique: mockFindUnique },
    tip: { aggregate: mockAggregate },
    creditScore: { upsert: mockUpsert },
    creditScoreHistory: {
      create: mockCreate,
      findMany: mockHistoryFindMany,
    },
    $transaction: mockTransaction,
    $disconnect: vi.fn(),
  },
}));

vi.mock('../../db/redis.js', () => ({
  redis: {
    get: mockRedisGet,
    set: mockRedisSet,
    on: vi.fn(),
  },
}));

describe('computeCreditScore (pure formula)', () => {
  it('returns base score for a new creator with no activity', () => {
    const result = computeCreditScore({
      totalTipsReceived: BigInt(0),
      xFollowers: 0,
      xEngagementAvg: 0,
      accountAgeDays: 0,
      streakBonus: 0,
    });

    expect(result.score).toBe(40);
    expect(result.tier).toBe('Silver');
    expect(result.components).toEqual({
      base: 40,
      tipVolume: 0,
      xMetrics: 0,
      accountAge: 0,
      streakBonus: 0,
    });
  });

  it('scores and caps the formula deterministically', () => {
    const result = computeCreditScore({
      totalTipsReceived: BigInt(1_000_000_000),
      xFollowers: 10000,
      xEngagementAvg: 1000,
      accountAgeDays: 10000,
      streakBonus: 100,
    });

    expect(result.score).toBe(100);
    expect(result.tier).toBe('Diamond');
  });

  it('combines tip volume, X metrics, age, and streak correctly', () => {
    const result = computeCreditScore({
      totalTipsReceived: BigInt(100_000_000),
      xFollowers: 500,
      xEngagementAvg: 100,
      accountAgeDays: 100,
      streakBonus: 5,
    });

    expect(result.score).toBeGreaterThan(40);
    expect(result.score).toBeLessThanOrEqual(100);
    expect(result.components.tipVolume).toBeGreaterThan(0);
    expect(result.components.xMetrics).toBeGreaterThan(0);
    expect(result.components.accountAge).toBeGreaterThan(0);
    expect(result.components.streakBonus).toBe(5);
  });
});

describe('credit score cache', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRedisGet.mockResolvedValue(null);
    mockRedisSet.mockResolvedValue('OK');
  });

  it('returns cached computed score before querying the database', async () => {
    mockRedisGet.mockResolvedValueOnce(
      JSON.stringify({
        userId: 'user-1',
        score: 75,
        tier: 'Gold',
        components: { base: 40, tipVolume: 20, xMetrics: 10, accountAge: 0, streakBonus: 5 },
        computedAt: '2026-07-24T00:00:00.000Z',
      }),
    );

    const result = await getCreditScoreByUsername('alice');

    expect(result.score).toBe(75);
    expect(mockFindUnique).not.toHaveBeenCalled();
  });

  it('caches a stored score after a cache miss', async () => {
    const computedAt = new Date('2026-07-24T00:00:00.000Z');
    mockFindUnique.mockResolvedValue({
      id: 'user-1',
      username: 'alice',
      deletedAt: null,
      creditScore: { value: 62, computedAt },
    });

    const result = await getCreditScoreByUsername('alice');

    expect(result.score).toBe(62);
    expect(mockRedisSet).toHaveBeenCalledWith(
      'credit:score:username:alice',
      expect.any(String),
      'EX',
      300,
    );
    expect(mockRedisSet).toHaveBeenCalledWith(
      'credit:score:user:user-1',
      expect.any(String),
      'EX',
      300,
    );
  });

  it('recalculates, persists history, and refreshes Redis cache', async () => {
    const createdAt = new Date(Date.now() - 20 * 24 * 60 * 60 * 1000);
    const computedAt = new Date('2026-07-24T00:00:00.000Z');
    mockFindUnique.mockResolvedValue({
      id: 'user-1',
      username: 'alice',
      stellarAddress: 'GA1',
      createdAt,
      deletedAt: null,
      streak: { currentStreak: 14 },
    });
    mockAggregate.mockResolvedValue({ _sum: { amountStroops: BigInt(100_000_000) } });
    mockUpsert.mockResolvedValue({ value: 44, computedAt });
    mockCreate.mockResolvedValue({});

    const result = await recalculateCreditScore('user-1');

    expect(result.score).toBe(44);
    expect(mockCreate).toHaveBeenCalledWith({ data: { userId: 'user-1', value: 44 } });
    expect(mockRedisSet).toHaveBeenCalledWith(
      'credit:score:user:user-1',
      expect.any(String),
      'EX',
      300,
    );
  });
});

describe('debounced recomputation on tips', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    mockRedisGet.mockResolvedValue(null);
    mockRedisSet.mockResolvedValue('OK');
  });

  afterEach(() => {
    vi.runAllTimers();
    vi.useRealTimers();
  });

  it('debounces rapid recomputation requests', async () => {
    const createdAt = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000);
    const computedAt = new Date();

    mockFindUnique.mockResolvedValue({
      id: 'user-1',
      username: 'alice',
      stellarAddress: 'GA1',
      createdAt,
      deletedAt: null,
      streak: { currentStreak: 0 },
    });
    mockAggregate.mockResolvedValue({ _sum: { amountStroops: BigInt(0) } });
    mockUpsert.mockResolvedValue({ value: 40, computedAt });
    mockCreate.mockResolvedValue({});

    // Trigger 3 rapid recomputation requests
    await scheduleRecomputeCreditScore('user-1');
    await scheduleRecomputeCreditScore('user-1');
    await scheduleRecomputeCreditScore('user-1');

    // Should not have called recalculateCreditScore yet (debounced)
    expect(mockUpsert).not.toHaveBeenCalled();

    // Fast-forward time to trigger the debounced call
    vi.advanceTimersByTime(5000);

    // Now it should have been called exactly once
    expect(mockUpsert).toHaveBeenCalledTimes(1);
  });
});

describe('GET /api/v1/credit/:identifier', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useRealTimers();
    mockRedisGet.mockResolvedValue(null);
    mockRedisSet.mockResolvedValue('OK');
  });

  it('returns 404 when username is not found', async () => {
    mockFindUnique.mockResolvedValue(null);

    const app = createApp();
    const res = await request(app).get('/api/v1/credit/nonexistent');

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
  });
});

describe('credit authorization', () => {
  it('rejects recalculating another user\'s score', async () => {
    const next = vi.fn();

    await recalculateController(
      {
        body: { userId: 'user-a' },
        user: { id: 'user-b' },
      } as never,
      {} as never,
      next,
    );

    expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 403 }));
    expect(mockFindUnique).not.toHaveBeenCalled();
  });
});
