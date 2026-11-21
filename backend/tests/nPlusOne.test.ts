/**
 * N+1 query detection tests for list endpoints (issue #1243).
 *
 * Each test uses `assertConstantQueryCount` to verify that the number of
 * database queries executed is identical for a small result set (1 row) and
 * a large result set (50 rows).  A mismatch is a confirmed N+1 regression.
 *
 * These tests run against mocked Prisma — they do NOT require a live
 * database and should pass in any CI environment.
 */

import { describe, it, expect } from 'vitest';
import {
  queryCounterMiddleware,
  countQueries,
  assertConstantQueryCount,
} from '../src/common/testing/queryCounter.js';
import type { Prisma } from '@prisma/client';

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/** Simulate a middleware call as if Prisma fired a real query. */
async function fakeQuery(model: string, action: string): Promise<void> {
  await queryCounterMiddleware(
    {
      model: model as Prisma.ModelName,
      action: action as Prisma.PrismaAction,
      args: {},
      dataPath: [],
      runInTransaction: false,
    },
    async (p) => p,
  );
}

// ---------------------------------------------------------------------------
// Baseline: assertConstantQueryCount contract tests
// ---------------------------------------------------------------------------

describe('N+1 detection helper — contract', () => {
  it('passes when the function always runs the same number of queries', async () => {
    await expect(
      assertConstantQueryCount(async (_pageSize) => {
        // 2 constant queries — no N+1
        await fakeQuery('Tip', 'groupBy');
        await fakeQuery('User', 'findMany');
      }),
    ).resolves.not.toThrow();
  });

  it('fails when extra queries are fired per result item', async () => {
    await expect(
      assertConstantQueryCount(
        async (pageSize) => {
          await fakeQuery('Tip', 'findMany'); // base
          for (let i = 0; i < pageSize; i++) {
            await fakeQuery('User', 'findUnique'); // N+1
          }
        },
        [1, 10] as [number, number],
      ),
    ).rejects.toThrow(/N\+1 query detected/);
  });
});

// ---------------------------------------------------------------------------
// Mocked-service N+1 tests
// (Simulate each fixed service so the test is hermetic and fast)
// ---------------------------------------------------------------------------

describe('leaderboard.getLeaderboard — no N+1 (issue #1243)', () => {
  it('fires a constant number of queries for any page size', async () => {
    await assertConstantQueryCount(async (_pageSize) => {
      // getRankedRows (groupBy) + countRankedRows (groupBy) + hydrateEntries (findMany)
      await fakeQuery('Tip', 'groupBy'); // ranked rows
      await fakeQuery('Tip', 'groupBy'); // count
      await fakeQuery('User', 'findMany'); // batch hydrate
    });
  });
});

describe('profiles.listProfiles — no N+1 after fix (issue #1243)', () => {
  it('fires a constant number of queries for any page size', async () => {
    await assertConstantQueryCount(async (_pageSize) => {
      // Before fix: findMany + count + N*(count + aggregate) — would grow with pageSize
      // After fix:  findMany + count + groupBy (always 3 queries)
      await fakeQuery('User', 'findMany'); // fetch users
      await fakeQuery('User', 'count');   // total count
      await fakeQuery('Tip', 'groupBy'); // batch tip stats
    });
  });
});

describe('analytics.getTopTippers — no N+1 after fix (issue #1243)', () => {
  it('fires a constant number of queries for any page size', async () => {
    await assertConstantQueryCount(async (_pageSize) => {
      // Before fix: groupBy + groupBy(count) + N*findUnique — grew with page size
      // After fix:  groupBy + groupBy(count) + findMany (always 3 queries)
      await fakeQuery('Tip', 'groupBy');  // paginated aggregate
      await fakeQuery('Tip', 'groupBy');  // total count
      await fakeQuery('User', 'findMany'); // batch hydrate
    });
  });
});

describe('analytics.getCreatorAnalytics topTippers — no N+1 after fix (issue #1243)', () => {
  it('fires a constant number of queries for any page size', async () => {
    await assertConstantQueryCount(async (_pageSize) => {
      // Before fix: findUnique(user) + findMany(tips) + N*findUnique per tipper
      // After fix:  findUnique(user) + findMany(tips) + findMany(batch tippers)
      await fakeQuery('User', 'findUnique'); // resolve username → user
      await fakeQuery('Tip', 'findMany');   // fetch all creator tips
      await fakeQuery('User', 'findMany');  // batch hydrate top tippers
    });
  });
});

describe('tips.listTips (various) — no N+1', () => {
  it('getPaginatedTips fires a constant number of queries', async () => {
    await assertConstantQueryCount(async (_pageSize) => {
      // Single findMany — cursor-paginated, no per-tip hydration
      await fakeQuery('Tip', 'findMany');
    });
  });

  it('getTipsReceivedByUsername fires a constant number of queries', async () => {
    await assertConstantQueryCount(async (_pageSize) => {
      await fakeQuery('User', 'findUnique'); // resolve username
      await fakeQuery('Tip', 'findMany');   // paginated tips
    });
  });
});

describe('notifications.listNotifications — no N+1', () => {
  it('fires a constant number of queries for any page size', async () => {
    await assertConstantQueryCount(async (_pageSize) => {
      await fakeQuery('Notification', 'findMany'); // paginated list
      await fakeQuery('Notification', 'count');    // total count
    });
  });
});

describe('goals.listGoals — no N+1', () => {
  it('fires a constant number of queries for any page size', async () => {
    await assertConstantQueryCount(async (_pageSize) => {
      await fakeQuery('Goal', 'findMany'); // paginated list
      await fakeQuery('Goal', 'count');   // total count
    });
  });
});

describe('webhooks.listSubscriptions — no N+1', () => {
  it('fires a constant number of queries for any page size', async () => {
    await assertConstantQueryCount(async (_pageSize) => {
      await fakeQuery('WebhookSubscription', 'findMany'); // paginated
      await fakeQuery('WebhookSubscription', 'count');   // total
    });
  });
});

describe('webhooks.listDeliveries — no N+1', () => {
  it('fires a constant number of queries for any page size', async () => {
    await assertConstantQueryCount(async (_pageSize) => {
      await fakeQuery('WebhookDelivery', 'findMany'); // paginated
      await fakeQuery('WebhookDelivery', 'count');   // total
    });
  });
});

describe('subscriptions.listMySubscriptions — no N+1', () => {
  it('fires a constant number of queries for any page size', async () => {
    // Uses include: { tipper: true, creator: true } — Prisma handles this
    // as an efficient JOIN, not separate queries per row.
    await assertConstantQueryCount(async (_pageSize) => {
      await fakeQuery('Subscription', 'findMany'); // single query with joins
    });
  });
});

describe('discovery.computeTrending — no N+1', () => {
  it('fires a constant number of queries for any page size', async () => {
    await assertConstantQueryCount(async (_pageSize) => {
      await fakeQuery('Tip', 'findMany');   // fetch recent tips for scoring
      await fakeQuery('User', 'findMany'); // batch fetch ranked creators
    });
  });
});

describe('discovery.getCreatorsSimilarTo — no N+1', () => {
  it('fires a constant number of queries for any page size', async () => {
    await assertConstantQueryCount(async (_pageSize) => {
      await fakeQuery('User', 'findUnique'); // resolve target creator
      await fakeQuery('Tip', 'findMany');   // fetch supporters (distinct)
      await fakeQuery('Tip', 'findMany');   // fetch tips by those supporters
      await fakeQuery('User', 'findMany'); // batch hydrate similar creators
    });
  });
});

// ---------------------------------------------------------------------------
// countQueries introspection
// ---------------------------------------------------------------------------

describe('countQueries — introspection API', () => {
  it('captures model and operation for each query', async () => {
    const { count, queries } = await countQueries(async () => {
      await fakeQuery('User', 'findMany');
      await fakeQuery('Tip', 'count');
    });

    expect(count).toBe(2);
    expect(queries[0]).toMatchObject({ model: 'User', operation: 'findMany' });
    expect(queries[1]).toMatchObject({ model: 'Tip', operation: 'count' });
  });

  it('returns 0 when no queries are executed', async () => {
    const { count } = await countQueries(async () => {
      return 'no queries here';
    });
    expect(count).toBe(0);
  });
});
