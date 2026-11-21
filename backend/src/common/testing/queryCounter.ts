/**
 * N+1 query detection helpers (issue #1243).
 *
 * ## Overview
 * This module exposes two tools:
 *
 * 1. `queryCounterMiddleware` — a Prisma `$use` middleware that tracks every
 *    database operation executed while a `countQueries` context is active.
 *
 * 2. `countQueries<T>(action)` — runs an async action under a query-counting
 *    context and returns `{ result, count, queries }`.
 *
 * 3. `assertConstantQueryCount<T>(runner, sizes?)` — parameterised N+1 detector.
 *    It runs `runner` twice — once for a small result set, once for a large one —
 *    and asserts that the number of database queries is identical.  A mismatch
 *    means an N+1 regression exists.
 *
 * ## Usage in tests
 * ```ts
 * import { countQueries, assertConstantQueryCount } from '../../src/common/testing/queryCounter.js';
 *
 * it('executes a constant number of queries regardless of page size', async () => {
 *   await assertConstantQueryCount(async (pageSize) => {
 *     return myService.listItems({ limit: pageSize });
 *   });
 * });
 * ```
 *
 * ## Usage for debugging
 * ```ts
 * const { result, count, queries } = await countQueries(() =>
 *   myService.doSomething()
 * );
 * console.log(`Ran ${count} queries:`, queries);
 * ```
 */

import { AsyncLocalStorage } from 'node:async_hooks';
import type { Prisma } from '@prisma/client';

// ---------------------------------------------------------------------------
// Internal async-local-storage context
// ---------------------------------------------------------------------------

/** Metadata about a single query that was captured during a countQueries run. */
export interface CapturedQuery {
  model: string;
  operation: string;
  durationMs: number;
}

/** Shape of the mutable context stored in the ALS. */
interface QueryCountContext {
  count: number;
  queries: CapturedQuery[];
}

const storage = new AsyncLocalStorage<QueryCountContext>();

// ---------------------------------------------------------------------------
// Prisma middleware
// ---------------------------------------------------------------------------

/**
 * Prisma `$use` middleware that increments the query counter for the current
 * async context (if one is active) and always passes through to `next`.
 *
 * Register this on the singleton Prisma client so all service calls are
 * automatically instrumented:
 *
 * ```ts
 * // src/db/prisma.ts
 * import { queryCounterMiddleware } from '../common/testing/queryCounter.js';
 * prisma.$use(queryCounterMiddleware);
 * ```
 */
export const queryCounterMiddleware: Prisma.Middleware = async (params, next) => {
  const start = performance.now();
  const result = await next(params);
  const durationMs = performance.now() - start;

  const ctx = storage.getStore();
  if (ctx) {
    ctx.count += 1;
    ctx.queries.push({
      model: params.model ?? 'unknown',
      operation: params.action,
      durationMs,
    });
  }

  return result;
};

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/** Result returned by `countQueries`. */
export interface QueryCountResult<T> {
  /** The value returned by the action. */
  result: T;
  /** Total number of Prisma operations executed during the action. */
  count: number;
  /** Per-query metadata (model, operation, duration). */
  queries: CapturedQuery[];
}

/**
 * Runs `action` inside a query-counting context and returns the result
 * together with the number of database queries executed.
 *
 * @example
 * const { count, queries } = await countQueries(() => leaderboardService.getLeaderboard('all', 10, 0));
 * expect(count).toBe(2); // groupBy + findMany
 */
export async function countQueries<T>(action: () => Promise<T>): Promise<QueryCountResult<T>> {
  const ctx: QueryCountContext = { count: 0, queries: [] };
  const result = await storage.run(ctx, action);
  return { result, count: ctx.count, queries: ctx.queries };
}

/**
 * Parameterised N+1 detector (issue #1243 acceptance criterion).
 *
 * Runs `runner(smallSize)` and `runner(largeSize)` and asserts that the
 * number of database queries executed is identical for both.  If the counts
 * differ, the test fails with a diagnostic message listing every query run
 * during the large pass.
 *
 * The default page sizes are 1 (small) and 50 (large) — as recommended in the
 * issue description.  This single assertion catches essentially every N+1 because
 * an N+1 would produce 51 queries for the large pass vs. 1 for the small.
 *
 * @param runner  A function that accepts a page size and returns a promise.
 * @param sizes   Override the default [1, 50] pair if your endpoint's max is smaller.
 *
 * @example
 * await assertConstantQueryCount(async (pageSize) => {
 *   await leaderboardService.getLeaderboard('all', pageSize, 0);
 * });
 */
export async function assertConstantQueryCount<T>(
  runner: (pageSize: number) => Promise<T>,
  sizes: [number, number] = [1, 50],
): Promise<void> {
  const [small, large] = sizes;
  const smallRun = await countQueries(() => runner(small));
  const largeRun = await countQueries(() => runner(large));

  if (smallRun.count !== largeRun.count) {
    const queryList = largeRun.queries
      .map((q, i) => `  ${i + 1}. ${q.model}.${q.operation} (${q.durationMs.toFixed(1)}ms)`)
      .join('\n');

    throw new Error(
      [
        `N+1 query detected! Query count changed with result-set size:`,
        `  page_size=${small}: ${smallRun.count} queries`,
        `  page_size=${large}: ${largeRun.count} queries`,
        ``,
        `Queries executed during page_size=${large} run:`,
        queryList,
        ``,
        `Fix: use Prisma \`include\` or batch with \`where: { id: { in: [...] } }\` instead of`,
        `     calling findUnique/findFirst inside a loop.`,
      ].join('\n'),
    );
  }
}
