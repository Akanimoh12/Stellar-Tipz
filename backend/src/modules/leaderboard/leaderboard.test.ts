/**
 * Unit tests for the leaderboard module.
 * Issue #933 – Leaderboard: Leaderboard by credit score variant.
 *
 * DB calls are mocked so no real database is needed.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Mock env & Prisma ─────────────────────────────────────────────────────────
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
    user: { findMany: vi.fn(), count: vi.fn(), findUnique: vi.fn() },
    tip: { groupBy: vi.fn(), count: vi.fn() },
    leaderboardSnapshot: { findMany: vi.fn(), count: vi.fn() },
    streak: { findUnique: vi.fn() },
    xAccount: { findUnique: vi.fn() },
  },
}));

import { getLeaderboard } from "./leaderboard.service.js";
import { prisma } from "@/db/prisma.js";

// ── Helpers ───────────────────────────────────────────────────────────────────

const fakeUsers = [
  { id: "u1", stellarAddress: "GAAA", username: "alice", displayName: "Alice", xHandle: null },
  { id: "u2", stellarAddress: "GBBB", username: "bob", displayName: "Bob", xHandle: null },
];

// ── Tips leaderboard – ALL_TIME ───────────────────────────────────────────────

describe("getLeaderboard – tips / ALL_TIME (issue #933)", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns entries ranked by totalTipsStroops", async () => {
    vi.mocked(prisma.tip.groupBy)
      // page call
      .mockResolvedValueOnce([
        { toAddress: "GAAA", _sum: { amountStroops: 5000n } } as never,
        { toAddress: "GBBB", _sum: { amountStroops: 2000n } } as never,
      ] as never)
      // total call
      .mockResolvedValueOnce([{}, {}] as never);

    vi.mocked(prisma.user.findUnique)
      .mockResolvedValueOnce(fakeUsers[0] as never)
      .mockResolvedValueOnce(fakeUsers[1] as never);

    const result = await getLeaderboard("tips", "ALL_TIME", 1, 20);

    expect(result.variant).toBe("tips");
    expect(result.period).toBe("ALL_TIME");
    expect(result.entries).toHaveLength(2);
    expect(result.entries[0].rank).toBe(1);
    expect(result.entries[0].totalTipsStroops).toBe("5000");
  });
});

// ── Tips leaderboard – WEEKLY (snapshot) ─────────────────────────────────────

describe("getLeaderboard – tips / WEEKLY snapshot (issue #933)", () => {
  beforeEach(() => vi.clearAllMocks());

  it("uses LeaderboardSnapshot for WEEKLY period", async () => {
    vi.mocked(prisma.leaderboardSnapshot.findMany).mockResolvedValueOnce([
      {
        rank: 1,
        totalTips: 9000n,
        user: fakeUsers[0],
      },
    ] as never);
    vi.mocked(prisma.leaderboardSnapshot.count).mockResolvedValueOnce(1 as never);

    const result = await getLeaderboard("tips", "WEEKLY", 1, 20);

    expect(result.entries).toHaveLength(1);
    expect(result.entries[0].rank).toBe(1);
    expect(result.entries[0].totalTipsStroops).toBe("9000");
    expect(prisma.leaderboardSnapshot.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { period: "WEEKLY" } }),
    );
  });
});

// ── Credit leaderboard ────────────────────────────────────────────────────────

describe("getLeaderboard – credit variant (issue #933)", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns entries with a creditScore field in [0, 100]", async () => {
    vi.mocked(prisma.user.findMany).mockResolvedValueOnce(fakeUsers as never);
    vi.mocked(prisma.user.count).mockResolvedValueOnce(2 as never);

    // Tip counts: tipsSent, tipsReceived, selfTips per user × 2 users
    vi.mocked(prisma.tip.count)
      .mockResolvedValue(0 as never);

    vi.mocked(prisma.streak.findUnique).mockResolvedValue(null);
    vi.mocked(prisma.xAccount.findUnique).mockResolvedValue(null);

    const result = await getLeaderboard("credit", "ALL_TIME", 1, 20);

    expect(result.variant).toBe("credit");
    expect(result.entries).toHaveLength(2);
    for (const entry of result.entries) {
      expect(entry.creditScore).toBeGreaterThanOrEqual(0);
      expect(entry.creditScore).toBeLessThanOrEqual(100);
    }
  });

  it("ranks users in descending credit score order", async () => {
    // User u1 has tips, u2 has none → u1 should rank first.
    vi.mocked(prisma.user.findMany).mockResolvedValueOnce(fakeUsers as never);
    vi.mocked(prisma.user.count).mockResolvedValueOnce(2 as never);
    vi.mocked(prisma.streak.findUnique).mockResolvedValue(null);
    vi.mocked(prisma.xAccount.findUnique).mockResolvedValue(null);

    // u1: 100 sent, 50 received, 0 self
    // u2: 0 sent, 0 received, 0 self
    vi.mocked(prisma.tip.count)
      .mockResolvedValueOnce(100 as never) // u1 sent
      .mockResolvedValueOnce(50 as never)  // u1 received
      .mockResolvedValueOnce(0 as never)   // u1 self
      .mockResolvedValueOnce(0 as never)   // u2 sent
      .mockResolvedValueOnce(0 as never)   // u2 received
      .mockResolvedValueOnce(0 as never);  // u2 self

    const result = await getLeaderboard("credit", "ALL_TIME", 1, 20);

    expect(result.entries[0].creditScore!).toBeGreaterThanOrEqual(
      result.entries[1].creditScore!,
    );
  });

  it("returns pagination metadata", async () => {
    vi.mocked(prisma.user.findMany).mockResolvedValueOnce([] as never);
    vi.mocked(prisma.user.count).mockResolvedValueOnce(0 as never);

    const result = await getLeaderboard("credit", "ALL_TIME", 2, 10);

    expect(result.page).toBe(2);
    expect(result.limit).toBe(10);
    expect(result.total).toBe(0);
import request from 'supertest';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { createApp } from '../../app.js';

const { mockGroupBy, mockFindMany, mockFindUnique } = vi.hoisted(() => ({
  mockGroupBy: vi.fn(),
  mockFindMany: vi.fn(),
  mockFindUnique: vi.fn(),
}));

vi.mock('../../db/prisma.js', () => ({
  prisma: {
    tip: {
      groupBy: mockGroupBy,
    },
    user: {
      findMany: mockFindMany,
      findUnique: mockFindUnique,
    },
    $disconnect: vi.fn(),
  },
}));

describe('GET /api/v1/leaderboard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 400 for invalid window', async () => {
    const app = createApp();
    const res = await request(app).get('/api/v1/leaderboard?window=INVALID');
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('returns empty leaderboard when no tips exist', async () => {
    mockGroupBy.mockResolvedValue([]);
    mockFindMany.mockResolvedValue([]);

    const app = createApp();
    const res = await request(app).get('/api/v1/leaderboard');
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual([]);
    expect(res.body.window).toBe('all');
  });

  it('defaults to all-time window when not specified', async () => {
    mockGroupBy.mockResolvedValue([]);
    mockFindMany.mockResolvedValue([]);

    const app = createApp();
    const res = await request(app).get('/api/v1/leaderboard');
    expect(res.status).toBe(200);
    expect(mockGroupBy).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { status: 'CONFIRMED' },
      }),
    );
  });

  it('filters by 24h window', async () => {
    mockGroupBy.mockResolvedValue([]);
    mockFindMany.mockResolvedValue([]);

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

  it('filters by 7d window', async () => {
    mockGroupBy.mockResolvedValue([]);
    mockFindMany.mockResolvedValue([]);

    const app = createApp();
    await request(app).get('/api/v1/leaderboard?window=7d');
    expect(mockGroupBy).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          status: 'CONFIRMED',
          createdAt: { gte: expect.any(Date) },
        }),
      }),
    );
  });

  it('returns leaderboard entries sorted by total tips descending', async () => {
    mockGroupBy.mockResolvedValue([
      { toAddress: 'GA...1', _sum: { amountStroops: BigInt(200_000_000) } },
      { toAddress: 'GA...2', _sum: { amountStroops: BigInt(100_000_000) } },
    ]);
    mockFindMany.mockResolvedValue([
      { id: 'user-1', username: 'alice', stellarAddress: 'GA...1' },
      { id: 'user-2', username: 'bob', stellarAddress: 'GA...2' },
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
    expect(res.body.window).toBe('all');
  });

  it('respects limit and offset params', async () => {
    mockGroupBy.mockResolvedValue([]);
    mockFindMany.mockResolvedValue([]);

    const app = createApp();
    await request(app).get('/api/v1/leaderboard?limit=5&offset=10');
    expect(mockGroupBy).toHaveBeenCalledWith(
      expect.objectContaining({ take: 5, skip: 10 }),
    );
  });

  it('returns unknown user data when user not found in DB', async () => {
    mockGroupBy.mockResolvedValue([
      { toAddress: 'GA...1', _sum: { amountStroops: BigInt(50_000_000) } },
    ]);
    mockFindMany.mockResolvedValue([]);

    const app = createApp();
    const res = await request(app).get('/api/v1/leaderboard');
    expect(res.status).toBe(200);
    expect(res.body.data[0].userId).toBe('');
    expect(res.body.data[0].username).toBeNull();
  });
});

describe('GET /api/v1/leaderboard/:userId', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 404 when user not found', async () => {
    mockFindUnique.mockResolvedValue(null);

    const app = createApp();
    const res = await request(app).get('/api/v1/leaderboard/user-999');
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
  });

  it('returns 404 when user has no tips in window', async () => {
    mockFindUnique.mockResolvedValue({ id: 'user-1', stellarAddress: 'GA...1' });
    mockGroupBy.mockResolvedValue([]);

    const app = createApp();
    const res = await request(app).get('/api/v1/leaderboard/user-1');
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
  });

  it('returns user rank when found', async () => {
    mockFindUnique.mockResolvedValue({ id: 'user-1', stellarAddress: 'GA...1' });
    mockGroupBy.mockResolvedValue([
      { toAddress: 'GA...1', _sum: { amountStroops: BigInt(50_000_000) } },
      { toAddress: 'GA...2', _sum: { amountStroops: BigInt(30_000_000) } },
    ]);

    const app = createApp();
    const res = await request(app).get('/api/v1/leaderboard/user-1');
    expect(res.status).toBe(200);
    expect(res.body.data.rank).toBe(1);
    expect(res.body.data.totalTips).toBe('50000000');
    expect(res.body.data.window).toBe('all');
  });

  it('accepts window query param for user rank', async () => {
    mockFindUnique.mockResolvedValue({ id: 'user-1', stellarAddress: 'GA...1' });
    mockGroupBy.mockResolvedValue([]);

    const app = createApp();
    const res = await request(app).get('/api/v1/leaderboard/user-1?window=7d');
    expect(res.status).toBe(404);
    expect(mockGroupBy).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          status: 'CONFIRMED',
          createdAt: { gte: expect.any(Date) },
        }),
      }),
    );
  });

  it('returns rank 2 when user is second', async () => {
    mockFindUnique.mockResolvedValue({ id: 'user-2', stellarAddress: 'GA...2' });
    mockGroupBy.mockResolvedValue([
      { toAddress: 'GA...1', _sum: { amountStroops: BigInt(100_000_000) } },
      { toAddress: 'GA...2', _sum: { amountStroops: BigInt(50_000_000) } },
    ]);

    const app = createApp();
    const res = await request(app).get('/api/v1/leaderboard/user-2');
    expect(res.status).toBe(200);
    expect(res.body.data.rank).toBe(2);
  });
});
