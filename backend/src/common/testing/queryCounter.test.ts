/**
 * N+1 query detection unit tests (issue #1243).
 */

import { describe, it, expect } from 'vitest';
import {
  queryCounterMiddleware,
  countQueries,
  assertConstantQueryCount,
} from './queryCounter.js';
import type { Prisma } from '@prisma/client';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Creates a minimal Prisma-middleware `params` object. */
function makeParams(model = 'Tip', action = 'findMany'): Prisma.MiddlewareParams {
  return {
    model: model as Prisma.ModelName,
    action: action as Prisma.PrismaAction,
    args: {},
    dataPath: [],
    runInTransaction: false,
  };
}

/** Runs the middleware in a simulated no-op way that calls next immediately. */
async function runMiddleware(params: Prisma.MiddlewareParams): Promise<void> {
  await queryCounterMiddleware(params, async (p) => p);
}

// ---------------------------------------------------------------------------
// queryCounterMiddleware
// ---------------------------------------------------------------------------

describe('queryCounterMiddleware', () => {
  it('passes through to next and returns its result', async () => {
    const expected = { id: '1' };
    const result = await queryCounterMiddleware(makeParams(), async () => expected);
    expect(result).toBe(expected);
  });

  it('does not increment count when no countQueries context is active', async () => {
    // No storage.run() wrapping this call — should be a no-op
    await expect(runMiddleware(makeParams())).resolves.not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// countQueries
// ---------------------------------------------------------------------------

describe('countQueries', () => {
  it('returns count 0 when no middleware queries are fired', async () => {
    const { result, count, queries } = await countQueries(async () => 42);
    expect(result).toBe(42);
    expect(count).toBe(0);
    expect(queries).toHaveLength(0);
  });

  it('counts queries fired via queryCounterMiddleware inside the action', async () => {
    const { count, queries } = await countQueries(async () => {
      await runMiddleware(makeParams('User', 'findUnique'));
      await runMiddleware(makeParams('Tip', 'findMany'));
    });

    expect(count).toBe(2);
    expect(queries[0]).toMatchObject({ model: 'User', operation: 'findUnique' });
    expect(queries[1]).toMatchObject({ model: 'Tip', operation: 'findMany' });
  });

  it('isolates counts between concurrent countQueries calls', async () => {
    const [a, b] = await Promise.all([
      countQueries(async () => {
        await runMiddleware(makeParams('User', 'findMany'));
        return 'a';
      }),
      countQueries(async () => {
        await runMiddleware(makeParams('Tip', 'count'));
        await runMiddleware(makeParams('Tip', 'aggregate'));
        return 'b';
      }),
    ]);

    expect(a.count).toBe(1);
    expect(b.count).toBe(2);
    expect(a.result).toBe('a');
    expect(b.result).toBe('b');
  });

  it('exposes durationMs for each captured query', async () => {
    const { queries } = await countQueries(async () => {
      await runMiddleware(makeParams('Goal', 'create'));
    });

    expect(queries[0].durationMs).toBeGreaterThanOrEqual(0);
  });
});

// ---------------------------------------------------------------------------
// assertConstantQueryCount
// ---------------------------------------------------------------------------

describe('assertConstantQueryCount', () => {
  it('passes when query count is the same for both page sizes', async () => {
    // Simulate a well-batched function: always 2 queries regardless of page size
    await expect(
      assertConstantQueryCount(async (pageSize) => {
        await runMiddleware(makeParams('Tip', 'groupBy'));    // query 1: aggregate
        await runMiddleware(makeParams('User', 'findMany')); // query 2: batch hydrate
        return Array.from({ length: pageSize }, (_, i) => i);
      }),
    ).resolves.not.toThrow();
  });

  it('throws when query count grows with result-set size (N+1)', async () => {
    // Simulate a broken function: 1 extra query per result item
    await expect(
      assertConstantQueryCount(
        async (pageSize) => {
          await runMiddleware(makeParams('Tip', 'findMany')); // base query
          for (let i = 0; i < pageSize; i++) {
            await runMiddleware(makeParams('User', 'findUnique')); // N+1 for each item
          }
        },
        [1, 10] as [number, number], // use smaller sizes to keep the test fast
      ),
    ).rejects.toThrow(/N\+1 query detected/);
  });

  it('includes a helpful diagnostic message on failure', async () => {
    let errorMessage = '';
    try {
      await assertConstantQueryCount(
        async (pageSize) => {
          for (let i = 0; i < pageSize; i++) {
            await runMiddleware(makeParams('Tip', 'findUnique'));
          }
        },
        [1, 3] as [number, number],
      );
    } catch (e) {
      errorMessage = (e as Error).message;
    }

    expect(errorMessage).toContain('page_size=1');
    expect(errorMessage).toContain('page_size=3');
    expect(errorMessage).toContain('Tip.findUnique');
    expect(errorMessage).toContain('batch');
  });

  it('accepts custom size pairs', async () => {
    await expect(
      assertConstantQueryCount(
        async (_pageSize) => {
          await runMiddleware(makeParams('User', 'count'));
        },
        [5, 25] as [number, number],
      ),
    ).resolves.not.toThrow();
  });
});
