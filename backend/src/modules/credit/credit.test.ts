import request from 'supertest';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { createApp } from '../../app.js';
import { computeCreditScore } from './credit.service.js';

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
    expect(result.components.base).toBe(40);
    expect(result.components.tipVolume).toBe(0);
    expect(result.components.xMetrics).toBe(0);
    expect(result.components.accountAge).toBe(0);
    expect(result.components.streakBonus).toBe(0);
  });

  it('scores tip volume correctly', () => {
    const result = computeCreditScore({
      totalTipsReceived: BigInt(100_000_000),
      xFollowers: 0,
      xEngagementAvg: 0,
      accountAgeDays: 0,
      streakBonus: 0,
    });
    // tipSub = 100_000_000 / 10_000_000 = 10
    // tipScore = 10 * 20 / 100 = 2
    expect(result.components.tipVolume).toBe(2);
    expect(result.score).toBe(42);
  });

  it('caps tip volume at 100 XLM (1000 XLM equivalent in stroops)', () => {
    const result = computeCreditScore({
      totalTipsReceived: BigInt(10_000_000_000),
      xFollowers: 0,
      xEngagementAvg: 0,
      accountAgeDays: 0,
      streakBonus: 0,
    });
    // tipSub = min(1_000_000_000 / 10_000_000, 100) = 100
    // tipScore = 100 * 20 / 100 = 20
    expect(result.components.tipVolume).toBe(20);
  });

  it('scores X metrics correctly', () => {
    const result = computeCreditScore({
      totalTipsReceived: BigInt(0),
      xFollowers: 2500,
      xEngagementAvg: 100,
      accountAgeDays: 0,
      streakBonus: 0,
    });
    // followerPart = min(2500/50, 50) = 50
    // engagementPart = min(100/10, 50) = 10
    // xSub = 60
    // xScore = 60 * 30 / 100 = 18
    expect(result.components.xMetrics).toBe(18);
    expect(result.score).toBe(58);
  });

  it('returns 0 for X component when no X data', () => {
    const result = computeCreditScore({
      totalTipsReceived: BigInt(0),
      xFollowers: 0,
      xEngagementAvg: 0,
      accountAgeDays: 100,
      streakBonus: 0,
    });
    expect(result.components.xMetrics).toBe(0);
  });

  it('scores account age correctly', () => {
    const result = computeCreditScore({
      totalTipsReceived: BigInt(0),
      xFollowers: 0,
      xEngagementAvg: 0,
      accountAgeDays: 365,
      streakBonus: 0,
    });
    // ageSub = 365 / 10 = 36 (capped at 100)
    // ageScore = 36 * 10 / 100 = 3
    expect(result.components.accountAge).toBe(3);
    expect(result.score).toBe(43);
  });

  it('returns 0 age score for accounts under 1 day', () => {
    const result = computeCreditScore({
      totalTipsReceived: BigInt(0),
      xFollowers: 0,
      xEngagementAvg: 0,
      accountAgeDays: 0,
      streakBonus: 0,
    });
    expect(result.components.accountAge).toBe(0);
  });

  it('applies streak bonus', () => {
    const result = computeCreditScore({
      totalTipsReceived: BigInt(0),
      xFollowers: 0,
      xEngagementAvg: 0,
      accountAgeDays: 0,
      streakBonus: 10,
    });
    expect(result.components.streakBonus).toBe(10);
    expect(result.score).toBe(50);
  });

  it('caps total score at 100', () => {
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

  it('returns correct tier for each range', () => {
    expect(computeCreditScore({ totalTipsReceived: BigInt(0), xFollowers: 0, xEngagementAvg: 0, accountAgeDays: 0, streakBonus: 0 }).tier).toBe('Silver');
    expect(computeCreditScore({ totalTipsReceived: BigInt(0), xFollowers: 0, xEngagementAvg: 0, accountAgeDays: 0, streakBonus: 0 }).score).toBe(40);
  });

  it('returned established creator score matches documented example', () => {
    const result = computeCreditScore({
      totalTipsReceived: BigInt(500_000_000),
      xFollowers: 2500,
      xEngagementAvg: 200,
      accountAgeDays: 365,
      streakBonus: 5,
    });
    // tip: 500_000_000 / 10_000_000 = 50 -> 50*20/100 = 10
    // x: follower=2500/50=50, engagement=200/10=20 -> 70 -> 70*30/100 = 21
    // age: 365/10=36 -> 36*10/100 = 3
    // streak: 5
    // total: 40 + 10 + 21 + 3 + 5 = 79 -> Gold
    expect(result.score).toBe(79);
    expect(result.tier).toBe('Gold');
  });
});

const { mockFindUnique, mockAggregate, mockUpsert, mockCreate } = vi.hoisted(() => ({
  mockFindUnique: vi.fn(),
  mockAggregate: vi.fn(),
  mockUpsert: vi.fn(),
  mockCreate: vi.fn(),
}));

vi.mock('../../db/prisma.js', () => ({
  prisma: {
    user: {
      findUnique: mockFindUnique,
    },
    tip: {
      aggregate: mockAggregate,
    },
    creditScore: {
      upsert: mockUpsert,
    },
    creditScoreHistory: {
      create: mockCreate,
    },
    $disconnect: vi.fn(),
  },
}));

describe('GET /api/v1/credit/:username', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 404 when username not found', async () => {
    mockFindUnique.mockResolvedValue(null);

    const app = createApp();
    const res = await request(app).get('/api/v1/credit/nonexistent');
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
    expect(mockFindUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { username: 'nonexistent' } }),
    );
  });

  it('returns 404 for soft-deleted user', async () => {
    mockFindUnique.mockResolvedValue({
      id: 'user-1',
      username: 'deleted-user',
      deletedAt: new Date(),
      creditScore: null,
    });

    const app = createApp();
    const res = await request(app).get('/api/v1/credit/deleted-user');
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
  });

  it('returns base score when user has no credit score', async () => {
    mockFindUnique.mockResolvedValue({
      id: 'user-1',
      username: 'alice',
      deletedAt: null,
      creditScore: null,
    });

    const app = createApp();
    const res = await request(app).get('/api/v1/credit/alice');
    expect(res.status).toBe(200);
    expect(res.body.data.score).toBe(40);
    expect(res.body.data.tier).toBe('Silver');
    expect(res.body.data.components.base).toBe(40);
    expect(res.body.data.computedAt).toBeDefined();
    expect(mockFindUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { username: 'alice' } }),
    );
  });

  it('returns stored credit score when available', async () => {
    const computedAt = new Date();
    mockFindUnique.mockResolvedValue({
      id: 'user-1',
      username: 'bob',
      deletedAt: null,
      creditScore: {
        id: 'cs-1',
        userId: 'user-1',
        value: 75,
        computedAt,
      },
    });

    const app = createApp();
    const res = await request(app).get('/api/v1/credit/bob');
    expect(res.status).toBe(200);
    expect(res.body.data.score).toBe(75);
    expect(res.body.data.tier).toBe('Gold');
    expect(res.body.data.components.base).toBe(40);
    expect(res.body.data.computedAt).toBe(computedAt.toISOString());
    expect(mockFindUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { username: 'bob' } }),
    );
  });

  it('returns score breakdown with components', async () => {
    const computedAt = new Date();
    mockFindUnique.mockResolvedValue({
      id: 'user-1',
      username: 'charlie',
      deletedAt: null,
      creditScore: {
        id: 'cs-1',
        userId: 'user-1',
        value: 85,
        computedAt,
      },
    });

    const app = createApp();
    const res = await request(app).get('/api/v1/credit/charlie');
    expect(res.status).toBe(200);
    expect(res.body.data.components).toEqual({
      base: 40,
      tipVolume: 0,
      xMetrics: 0,
      accountAge: 0,
      streakBonus: 0,
    });
  });
});
