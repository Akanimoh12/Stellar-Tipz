/**
 * Unit tests for the credit module.
 * Tests cover:
 *   #922 – Credit: Credit score anti-gaming safeguards
 *   #919 – Credit: Credit score recompute on X metrics refresh
 *   #920 – Credit: Credit score bounds + normalization
 *
 * Pure formula functions are tested without a DB or env; DB-backed
 * service functions use Vitest mocks.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Mock env & Prisma so no real DB is needed ─────────────────────────────────
vi.mock("@/config/env.js", () => ({
  env: {
    NODE_ENV: "test",
    PORT: 4000,
    API_BASE_PATH: "/api/v1",
    CORS_ORIGIN: "http://localhost:5173",
    JWT_SECRET: "test-secret",
    JWT_EXPIRES_IN: "15m",
    REFRESH_TOKEN_EXPIRES_IN: "7d",
    AUTH_CHALLENGE_TTL_SECONDS: 300,
    LOG_LEVEL: "silent",
  },
}));

vi.mock("@/db/prisma.js", () => ({
  prisma: {
    user: { findUnique: vi.fn(), count: vi.fn() },
    tip: { count: vi.fn() },
    streak: { findUnique: vi.fn() },
    xAccount: { findUnique: vi.fn() },
  },
}));

import {
  clamp,
  normalise,
  computeAntiGamingPenalty,
  computeCreditScore,
  ANTI_GAMING,
  getCreditScore,
  recomputeCreditScore,
} from "./credit.service.js";
import { prisma } from "@/db/prisma.js";
import type { CreditSignals } from "./credit.types.js";

// ── Helpers ───────────────────────────────────────────────────────────────────

const baseSignals = (): CreditSignals => ({
  tipsSent: 100,
  tipsReceived: 50,
  streak: 30,
  xFollowers: 5000,
  xEngagement: 0.05,
  selfTips: 0,
  washTipRatio: 0,
});

const fakeUser = {
  id: "user_01",
  stellarAddress: "GABC123",
  xHandle: "testhandle",
};

// ── Issue #920: clamp ─────────────────────────────────────────────────────────

describe("clamp (issue #920)", () => {
  it("returns the value when within range", () => {
    expect(clamp(50, 0, 100)).toBe(50);
  });

  it("clamps to min when below range", () => {
    expect(clamp(-10, 0, 100)).toBe(0);
  });

  it("clamps to max when above range", () => {
    expect(clamp(150, 0, 100)).toBe(100);
  });

  it("clamps boundary values correctly", () => {
    expect(clamp(0, 0, 100)).toBe(0);
    expect(clamp(100, 0, 100)).toBe(100);
  });
});

// ── Issue #920: normalise ─────────────────────────────────────────────────────

describe("normalise (issue #920)", () => {
  it("returns 0 when value is 0", () => {
    expect(normalise(0, 500)).toBe(0);
  });

  it("returns 100 when value equals maxExpected", () => {
    expect(normalise(500, 500)).toBe(100);
  });

  it("clamps to 100 when value exceeds maxExpected", () => {
    expect(normalise(1000, 500)).toBe(100);
  });

  it("normalises proportionally", () => {
    expect(normalise(250, 500)).toBe(50);
  });

  it("returns 0 when maxExpected is 0 (guard against division by zero)", () => {
    expect(normalise(100, 0)).toBe(0);
  });
});

// ── Issue #922: anti-gaming penalty ──────────────────────────────────────────

describe("computeAntiGamingPenalty (issue #922)", () => {
  it("returns 0 when there are no self-tips and no wash-tipping", () => {
    expect(computeAntiGamingPenalty(0, 0)).toBe(0);
  });

  it("penalises each self-tip by SELF_TIP_PENALTY_PER_TIP", () => {
    const penalty = computeAntiGamingPenalty(1, 0);
    expect(penalty).toBe(ANTI_GAMING.SELF_TIP_PENALTY_PER_TIP);
  });

  it("caps self-tip penalty at MAX_SELF_TIP_PENALTY", () => {
    // 100 self-tips × 2 = 200, capped at 20
    const penalty = computeAntiGamingPenalty(100, 0);
    expect(penalty).toBe(ANTI_GAMING.MAX_SELF_TIP_PENALTY);
  });

  it("penalises a full wash-tip ratio by WASH_TIP_WEIGHT", () => {
    const penalty = computeAntiGamingPenalty(0, 1);
    expect(penalty).toBe(ANTI_GAMING.WASH_TIP_WEIGHT);
  });

  it("combines both penalties and caps total at 50", () => {
    // 100 self-tips (cap 20) + wash 1.0 (30) = 50
    const penalty = computeAntiGamingPenalty(100, 1);
    expect(penalty).toBe(50);
  });

  it("clamps washTipRatio to [0, 1]", () => {
    const overPenalty = computeAntiGamingPenalty(0, 5);
    const normalPenalty = computeAntiGamingPenalty(0, 1);
    expect(overPenalty).toBe(normalPenalty);
  });
});

// ── Issue #920 + #922: computeCreditScore (pure formula) ─────────────────────

describe("computeCreditScore (issues #920 & #922)", () => {
  it("returns a score in [0, 100]", () => {
    const result = computeCreditScore("u1", baseSignals());
    expect(result.score).toBeGreaterThanOrEqual(0);
    expect(result.score).toBeLessThanOrEqual(100);
  });

  it("returns score 0 when all signals are zero", () => {
    const signals: CreditSignals = {
      tipsSent: 0,
      tipsReceived: 0,
      streak: 0,
      xFollowers: 0,
      xEngagement: null,
      selfTips: 0,
      washTipRatio: 0,
    };
    const result = computeCreditScore("u1", signals);
    expect(result.score).toBe(0);
  });

  it("returns a lower score when anti-gaming signals are high", () => {
    const clean = computeCreditScore("u1", baseSignals());
    const gamed = computeCreditScore("u1", {
      ...baseSignals(),
      selfTips: 100,
      washTipRatio: 1,
    });
    expect(gamed.score).toBeLessThan(clean.score);
  });

  it("breaks down sub-scores in the result", () => {
    const result = computeCreditScore("u1", baseSignals());
    expect(result.breakdown).toMatchObject({
      volumeScore: expect.any(Number),
      streakScore: expect.any(Number),
      socialScore: expect.any(Number),
      antiGamingPenalty: expect.any(Number),
    });
  });

  it("includes computedAt as a valid ISO string", () => {
    const result = computeCreditScore("u1", baseSignals());
    expect(() => new Date(result.computedAt).toISOString()).not.toThrow();
  });

  it("score is identical given the same inputs (pure function)", () => {
    const r1 = computeCreditScore("u1", baseSignals());
    const r2 = computeCreditScore("u1", baseSignals());
    expect(r1.score).toBe(r2.score);
  });
});

// ── Issue #919: getCreditScore (DB-backed, mocked) ────────────────────────────

describe("getCreditScore – DB integration (issue #919)", () => {
  beforeEach(() => vi.clearAllMocks());

  function setupMocks(
    overrides: Partial<{
      streak: number | null;
      xFollowers: number;
      xEngagement: number | null;
      tipsSent: number;
      tipsReceived: number;
      selfTips: number;
    }> = {},
  ) {
    const opts = {
      streak: 10,
      xFollowers: 1000,
      xEngagement: 0.03,
      tipsSent: 50,
      tipsReceived: 30,
      selfTips: 0,
      ...overrides,
    };

    vi.mocked(prisma.user.findUnique)
      .mockResolvedValueOnce(fakeUser as never) // initial exists check
      .mockResolvedValueOnce(fakeUser as never) // buildSignalsForUser user
      .mockResolvedValueOnce(fakeUser as never); // buildSignalsForUser xHandle lookup

    vi.mocked(prisma.streak.findUnique).mockResolvedValueOnce(
      opts.streak !== null
        ? ({ currentStreak: opts.streak } as never)
        : null,
    );

    vi.mocked(prisma.xAccount.findUnique).mockResolvedValueOnce(
      opts.xFollowers !== undefined
        ? ({ followers: opts.xFollowers, engagement: opts.xEngagement } as never)
        : null,
    );

    // tip counts: [sent, received, selfTips]
    vi.mocked(prisma.tip.count)
      .mockResolvedValueOnce(opts.tipsSent as never)
      .mockResolvedValueOnce(opts.tipsReceived as never)
      .mockResolvedValueOnce(opts.selfTips as never);
  }

  it("returns a CreditScore with a numeric score", async () => {
    setupMocks();
    const result = await getCreditScore("user_01");
    expect(typeof result.score).toBe("number");
    expect(result.userId).toBe("user_01");
  });

  it("throws NotFoundError when user does not exist", async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValueOnce(null);
    await expect(getCreditScore("ghost")).rejects.toMatchObject({
      statusCode: 404,
    });
  });
});

// ── Issue #919: recomputeCreditScore ─────────────────────────────────────────

describe("recomputeCreditScore (issue #919)", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns a fresh CreditScore after recompute", async () => {
    vi.mocked(prisma.user.findUnique)
      .mockResolvedValueOnce(fakeUser as never)
      .mockResolvedValueOnce(fakeUser as never);

    vi.mocked(prisma.streak.findUnique).mockResolvedValueOnce(
      { currentStreak: 5 } as never,
    );
    vi.mocked(prisma.xAccount.findUnique).mockResolvedValueOnce(
      { followers: 200, engagement: 0.01 } as never,
    );
    vi.mocked(prisma.tip.count)
      .mockResolvedValueOnce(10 as never)
      .mockResolvedValueOnce(5 as never)
      .mockResolvedValueOnce(0 as never);

    const result = await recomputeCreditScore("user_01");
    expect(result.userId).toBe("user_01");
    expect(result.score).toBeGreaterThanOrEqual(0);
    expect(result.score).toBeLessThanOrEqual(100);
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

const { mockFindUnique, mockFindMany, mockCount, mockAggregate, mockUpsert, mockCreate } = vi.hoisted(() => ({
const { mockFindUnique, mockAggregate, mockUpsert, mockCreate, mockHistoryFindMany } = vi.hoisted(() => ({
  mockFindUnique: vi.fn(),
  mockFindMany: vi.fn(),
  mockCount: vi.fn(),
  mockAggregate: vi.fn(),
  mockUpsert: vi.fn(),
  mockCreate: vi.fn(),
  mockHistoryFindMany: vi.fn(),
}));

vi.mock('../../db/prisma.js', () => ({
  prisma: {
    user: {
      findUnique: mockFindUnique,
      findMany: mockFindMany,
      count: mockCount,
    },
    tip: {
      aggregate: mockAggregate,
    },
    creditScore: {
      upsert: mockUpsert,
    },
    creditScoreHistory: {
      create: mockCreate,
      findMany: mockHistoryFindMany,
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

describe('backfillCreditScores', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('processes users in batches and upserts credit scores', async () => {
    const now = new Date();
    mockCount.mockResolvedValue(2);
    mockFindMany
      .mockResolvedValueOnce([
        { id: 'user-1', stellarAddress: 'GA...1', createdAt: now, deletedAt: null, streak: { currentStreak: 14 } },
        { id: 'user-2', stellarAddress: 'GA...2', createdAt: now, deletedAt: null, streak: null },
      ])
      .mockResolvedValueOnce([]);
    mockAggregate.mockResolvedValue({ _sum: { amountStroops: BigInt(100_000_000) } });

    const { backfillCreditScores } = await import('./credit.backfill.js');
    const result = await backfillCreditScores();

    expect(result.totalUsers).toBe(2);
    expect(result.processed).toBe(2);
    expect(result.errors).toBe(0);

    expect(mockUpsert).toHaveBeenCalledTimes(2);
    expect(mockCreate).toHaveBeenCalledTimes(2);
  });

  it('skips soft-deleted users', async () => {
    mockCount.mockResolvedValue(0);
    mockFindMany.mockResolvedValue([]);

    const { backfillCreditScores } = await import('./credit.backfill.js');
    const result = await backfillCreditScores();

    expect(result.totalUsers).toBe(0);
    expect(result.processed).toBe(0);
  });

  it('handles batch iteration with cursor pagination', async () => {
    const now = new Date();
    mockCount.mockResolvedValue(3);
    mockFindMany
      .mockResolvedValueOnce([
        { id: 'user-1', stellarAddress: 'GA...1', createdAt: now, deletedAt: null, streak: null },
        { id: 'user-2', stellarAddress: 'GA...2', createdAt: now, deletedAt: null, streak: null },
      ])
      .mockResolvedValueOnce([
        { id: 'user-3', stellarAddress: 'GA...3', createdAt: now, deletedAt: null, streak: null },
      ])
      .mockResolvedValueOnce([]);
    mockAggregate.mockResolvedValue({ _sum: { amountStroops: BigInt(0) } });

    const { backfillCreditScores } = await import('./credit.backfill.js');
    const result = await backfillCreditScores();

    expect(result.totalUsers).toBe(3);
    expect(result.processed).toBe(3);
    expect(mockFindMany).toHaveBeenCalledTimes(3);
  });

  it('continues processing when a single user fails', async () => {
    const now = new Date();
    mockCount.mockResolvedValue(2);
    mockFindMany
      .mockResolvedValueOnce([
        { id: 'user-1', stellarAddress: 'GA...1', createdAt: now, deletedAt: null, streak: null },
        { id: 'user-2', stellarAddress: 'GA...2', createdAt: now, deletedAt: null, streak: null },
      ])
      .mockResolvedValueOnce([]);

    mockAggregate
      .mockRejectedValueOnce(new Error('DB error'))
      .mockResolvedValue({ _sum: { amountStroops: BigInt(0) } });

    const { backfillCreditScores } = await import('./credit.backfill.js');
    const result = await backfillCreditScores();

    expect(result.totalUsers).toBe(2);
    expect(result.processed).toBe(1);
    expect(result.errors).toBe(1);
  });
});

describe('GET /api/v1/credit/:userId/history', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 404 when user not found', async () => {
    mockFindUnique.mockResolvedValue(null);

    const app = createApp();
    const res = await request(app).get('/api/v1/credit/nonexistent/history');
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
  });

  it('returns the time series of a creator\'s score', async () => {
    mockFindUnique.mockResolvedValue({ id: 'user-1', deletedAt: null });
    mockHistoryFindMany.mockResolvedValue([
      { value: 42, computedAt: new Date('2024-01-01T00:00:00.000Z') },
      { value: 55, computedAt: new Date('2024-02-01T00:00:00.000Z') },
    ]);

    const app = createApp();
    const res = await request(app).get('/api/v1/credit/user-1/history');
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual([
      { value: 42, computedAt: '2024-01-01T00:00:00.000Z' },
      { value: 55, computedAt: '2024-02-01T00:00:00.000Z' },
    ]);
    expect(mockHistoryFindMany).toHaveBeenCalledWith({
      where: { userId: 'user-1' },
      orderBy: { computedAt: 'asc' },
      skip: 0,
      take: 20,
    });
  });
});
