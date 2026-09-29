import request from 'supertest';
import { Prisma } from '@prisma/client';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp } from '../../app.js';
import { createLeaderboardSnapshot, getLeaderboard, getUserRank } from './leaderboard.service.js';
import { assertConstantQueryCount, queryCounterMiddleware } from '../../common/testing/queryCounter.js';

const {
  mockQueryRaw,
  mockFindMany,
  mockFindUnique,
  mockDeleteMany,
  mockCreateMany,
  mockTransaction,
} = vi.hoisted(() => ({
  mockQueryRaw: vi.fn(),
  mockFindMany: vi.fn(),
  mockFindUnique: vi.fn(),
  mockDeleteMany: vi.fn(),
  mockCreateMany: vi.fn(),
  mockTransaction: vi.fn(),
}));

vi.mock('../../db/prisma.js', () => ({
  prisma: {
    user: { findMany: mockFindMany, findUnique: mockFindUnique },
    leaderboardSnapshot: {
      deleteMany: mockDeleteMany,
      createMany: mockCreateMany,
    },
    $queryRaw: mockQueryRaw,
    $transaction: mockTransaction,
    $disconnect: vi.fn(),
  },
}));

type Creator = { toAddress: string; total: bigint; reachedAtLedger: number };

/** Rebuilds the Prisma.Sql a `$queryRaw` tagged-template call was made with. */
function sqlOf(call: unknown[]): Prisma.Sql {
  return Prisma.sql(call[0] as TemplateStringsArray, ...(call.slice(1) as Prisma.Sql[]));
}

/** Ranked order from the service contract: total desc, reached-first, then address (byte order). */
function compareRanked(a: Creator, b: Creator): number {
  if (a.total !== b.total) return a.total > b.total ? -1 : 1;
  if (a.reachedAtLedger !== b.reachedAtLedger) return a.reachedAtLedger - b.reachedAtLedger;
  return a.toAddress < b.toAddress ? -1 : a.toAddress > b.toAddress ? 1 : 0;
}

/**
 * Evaluates the leaderboard's ranked-page, count and rank queries against an
 * in-memory set of creators, honouring the keyset (`HAVING (...) > (...)`),
 * LIMIT and OFFSET values the service passes.
 */
function serveRankedQueries(creators: Creator[]): void {
  const ordered = [...creators].sort(compareRanked);
  mockQueryRaw.mockImplementation(async (...call: unknown[]) => {
    const { sql, values } = sqlOf(call);
    const params = values.filter((value) => !(value instanceof Date));
    if (sql.includes('AS "creators"')) return [{ count: BigInt(ordered.length) }];
    if (sql.includes('ROW_NUMBER')) {
      const index = ordered.findIndex((c) => c.toAddress === params[0]);
      return index === -1 ? [] : [{ rank: BigInt(index + 1), total: ordered[index].total }];
    }
    let rows = ordered;
    if (sql.includes('HAVING')) {
      const [negTotal, ledger, address] = params.splice(0, 3) as [bigint, number, string];
      const cursor: Creator = { total: -negTotal, reachedAtLedger: ledger, toAddress: address };
      rows = rows.filter((row) => compareRanked(row, cursor) > 0);
    }
    const limit = sql.includes('LIMIT') ? Number(params.shift()) : rows.length;
    const offset = sql.includes('OFFSET') ? Number(params.shift()) : 0;
    return rows.slice(offset, offset + limit);
  });
}

function usersFor(creators: Creator[]) {
  return creators.map((c, i) => ({ id: `user-${i}`, username: `u${i}`, stellarAddress: c.toAddress }));
}

beforeEach(() => {
  vi.clearAllMocks();
  mockQueryRaw.mockResolvedValue([]);
  mockFindMany.mockResolvedValue([]);
});

describe('GET /api/v1/leaderboard', () => {
  it('returns 400 for invalid window', async () => {
    const app = createApp();
    const res = await request(app).get('/api/v1/leaderboard?window=INVALID');
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('returns creators ranked by confirmed tip volume', async () => {
    const creators = [
      { toAddress: 'GA1', total: 200_000_000n, reachedAtLedger: 5 },
      { toAddress: 'GA2', total: 100_000_000n, reachedAtLedger: 3 },
    ];
    serveRankedQueries(creators);
    mockFindMany.mockResolvedValue([
      { id: 'user-1', username: 'alice', stellarAddress: 'GA1' },
      { id: 'user-2', username: 'bob', stellarAddress: 'GA2' },
    ]);

    const res = await request(createApp()).get('/api/v1/leaderboard');

    expect(res.status).toBe(200);
    expect(res.body.data).toEqual([
      { rank: 1, userId: 'user-1', username: 'alice', stellarAddress: 'GA1', totalTips: '200000000' },
      { rank: 2, userId: 'user-2', username: 'bob', stellarAddress: 'GA2', totalTips: '100000000' },
    ]);
    expect(res.body.pagination).toEqual({ limit: 20, offset: 0, total: 2, hasMore: false, nextCursor: null });
  });

  it('orders by volume, then reached-first ledger, then address — a total order', async () => {
    await getLeaderboard('all', 20, 0);

    const { sql } = sqlOf(mockQueryRaw.mock.calls[0]);
    expect(sql).toMatch(/ORDER BY "total" DESC, "reachedAtLedger" ASC, "toAddress" COLLATE "C" ASC/);
    expect(sql).toContain(`"status" = 'CONFIRMED'`);
  });

  it('filters by 24h window', async () => {
    await request(createApp()).get('/api/v1/leaderboard?window=24h');

    const { sql, values } = sqlOf(mockQueryRaw.mock.calls[0]);
    expect(sql).toContain('"createdAt" >=');
    expect(values[0]).toBeInstanceOf(Date);
  });

  it('rejects cursor and offset together', async () => {
    const res = await request(createApp()).get('/api/v1/leaderboard?cursor=abc&offset=5');
    expect(res.status).toBe(400);
  });

  it('marks offset pagination as deprecated', async () => {
    const res = await request(createApp()).get('/api/v1/leaderboard?offset=0');
    expect(res.status).toBe(200);
    expect(res.headers.deprecation).toBeDefined();
  });

  it('rejects a tampered cursor', async () => {
    serveRankedQueries([
      { toAddress: 'GA1', total: 5n, reachedAtLedger: 1 },
      { toAddress: 'GA2', total: 5n, reachedAtLedger: 1 },
    ]);
    const { pagination } = await getLeaderboard('all', 1, 0);

    const res = await request(createApp()).get(
      `/api/v1/leaderboard?cursor=${pagination.nextCursor}x`,
    );
    expect(res.status).toBe(400);
  });

  it('rejects a cursor issued for a different window', async () => {
    serveRankedQueries([
      { toAddress: 'GA1', total: 5n, reachedAtLedger: 1 },
      { toAddress: 'GA2', total: 5n, reachedAtLedger: 1 },
    ]);
    const { pagination } = await getLeaderboard('all', 1, 0);

    await expect(getLeaderboard('7d', 1, 0, pagination.nextCursor!)).rejects.toThrow('Invalid pagination cursor');
  });
});

describe('leaderboard pagination under ties (issue #1269)', () => {
  // 23 creators with identical volume; several also share the ledger they
  // reached it on, so only the address separates them.
  const creators: Creator[] = Array.from({ length: 23 }, (_, i) => ({
    toAddress: `G${String((i * 7) % 23).padStart(3, '0')}`,
    total: 1_000_000n,
    reachedAtLedger: 100 + (i % 3),
  }));
  const expectedOrder = [...creators].sort(compareRanked).map((c) => c.toAddress);

  beforeEach(() => {
    serveRankedQueries(creators);
    mockFindMany.mockImplementation(async () => usersFor(creators));
  });

  it('pages through all-equal scores by cursor with no duplicates or gaps', async () => {
    const seen: string[] = [];
    const ranks: number[] = [];
    let cursor: string | undefined;
    let pages = 0;

    do {
      const page = await getLeaderboard('all', 4, 0, cursor);
      seen.push(...page.data.map((entry) => entry.stellarAddress));
      ranks.push(...page.data.map((entry) => entry.rank));
      cursor = page.pagination.nextCursor ?? undefined;
      pages += 1;
      expect(page.pagination.total).toBe(creators.length);
    } while (cursor && pages < 20);

    expect(seen).toEqual(expectedOrder);
    expect(new Set(seen).size).toBe(creators.length);
    expect(ranks).toEqual(Array.from({ length: creators.length }, (_, i) => i + 1));
    expect(pages).toBe(Math.ceil(creators.length / 4));
  });

  it('keeps the deprecated offset pages consistent with the same total order', async () => {
    const seen: string[] = [];
    for (let offset = 0; offset < creators.length; offset += 5) {
      const page = await getLeaderboard('all', 5, offset);
      seen.push(...page.data.map((entry) => entry.stellarAddress));
    }
    expect(seen).toEqual(expectedOrder);
  });

  it('ranks the creator who reached an equal total first higher', async () => {
    serveRankedQueries([
      { toAddress: 'GLATE', total: 50n, reachedAtLedger: 900 },
      { toAddress: 'GEARLY', total: 50n, reachedAtLedger: 100 },
    ]);
    mockFindMany.mockResolvedValue([]);

    const page = await getLeaderboard('all', 10, 0);
    expect(page.data.map((entry) => entry.stellarAddress)).toEqual(['GEARLY', 'GLATE']);
  });

  it('runs a constant number of queries for any page size', async () => {
    const counted = (model: string, action: string, impl: (...a: unknown[]) => unknown) =>
      (...args: unknown[]) =>
        queryCounterMiddleware(
          { model: model as Prisma.ModelName, action: action as Prisma.PrismaAction, args: {}, dataPath: [], runInTransaction: false },
          async () => impl(...args),
        );
    const rawImpl = mockQueryRaw.getMockImplementation()!;
    mockQueryRaw.mockImplementation(counted('Tip', 'queryRaw', rawImpl));
    mockFindMany.mockImplementation(counted('User', 'findMany', async () => usersFor(creators)));

    await assertConstantQueryCount((pageSize) => getLeaderboard('all', pageSize, 0), [1, 20]);
  });
});

describe('GET /api/v1/leaderboard/:userId', () => {
  it('returns the rank from the same total order', async () => {
    mockFindUnique.mockResolvedValue({ stellarAddress: 'GA2' });
    serveRankedQueries([
      { toAddress: 'GA1', total: 100n, reachedAtLedger: 1 },
      { toAddress: 'GA2', total: 50n, reachedAtLedger: 1 },
    ]);

    const res = await request(createApp()).get('/api/v1/leaderboard/user-2');

    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({ rank: 2, totalTips: '50', window: 'all' });
    const { sql } = sqlOf(mockQueryRaw.mock.calls[0]);
    expect(sql).toMatch(
      /ROW_NUMBER\(\) OVER \(ORDER BY SUM\("amountStroops"\) DESC, MAX\("ledger"\) ASC, "toAddress" COLLATE "C" ASC\)/,
    );
  });

  it('returns 404 when the user has no confirmed tips in the window', async () => {
    mockFindUnique.mockResolvedValue({ stellarAddress: 'GNONE' });
    serveRankedQueries([{ toAddress: 'GA1', total: 100n, reachedAtLedger: 1 }]);

    await expect(getUserRank('user-x', 'all')).rejects.toThrow('User not found on the leaderboard');
  });
});

describe('createLeaderboardSnapshot', () => {
  beforeEach(() => {
    mockDeleteMany.mockReturnValue({ kind: 'delete' });
    mockCreateMany.mockReturnValue({ kind: 'create' });
    mockTransaction.mockResolvedValue([]);
  });

  it('rebuilds a period snapshot in the leaderboard total order', async () => {
    serveRankedQueries([
      { toAddress: 'GA2', total: 100n, reachedAtLedger: 7 },
      { toAddress: 'GA1', total: 100n, reachedAtLedger: 3 },
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
        { period: 'WEEKLY', rank: 1, userId: 'user-1', totalTips: 100n },
        { period: 'WEEKLY', rank: 2, userId: 'user-2', totalTips: 100n },
      ],
    });
  });
});
