/**
 * Test helpers re-export for the N+1 query counter (issue #1243).
 *
 * Import from here in integration tests located under `tests/`:
 *
 * ```ts
 * import { countQueries, assertConstantQueryCount } from './helpers/queryCounter.js';
 * ```
 *
 * For unit tests that live alongside source files (`src/**/*.test.ts`), import
 * directly from the source module instead:
 *
 * ```ts
 * import { countQueries } from '../common/testing/queryCounter.js';
 * ```
 */

export {
  queryCounterMiddleware,
  countQueries,
  assertConstantQueryCount,
} from '../../src/common/testing/queryCounter.js';
export type { CapturedQuery, QueryCountResult } from '../../src/common/testing/queryCounter.js';
