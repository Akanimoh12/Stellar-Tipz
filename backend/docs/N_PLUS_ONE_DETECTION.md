# N+1 Query Detection (Issue #1243)

This document describes the N+1 query detection system added to the Stellar-Tipz backend test suite.

## What is an N+1 Query?

An N+1 query problem occurs when an endpoint fetches a list of N items and then
fires an additional database query _for each item_ to hydrate associated data.
For example, fetching 50 profiles and then running 50 separate `findUnique` calls
for tip stats — 51 total queries — instead of a single batched `groupBy` — 1 query.

At scale, N+1 patterns cause:
- Exponential database load as page sizes grow.
- Increased API latency for list endpoints.
- Database connection pool exhaustion.

## Detection Helpers

All helpers live in `src/common/testing/queryCounter.ts` and are re-exported from
`tests/helpers/queryCounter.ts` for integration tests.

### `countQueries<T>(action)`

Runs an async action in a query-counting context and returns:

```ts
{ result: T, count: number, queries: CapturedQuery[] }
```

**Example**:
```ts
import { countQueries } from '../../src/common/testing/queryCounter.js';

const { count, queries } = await countQueries(() =>
  profilesService.listProfiles(1, 20)
);
// Inspect which queries ran:
console.log(queries.map(q => `${q.model}.${q.operation}`));
```

### `assertConstantQueryCount<T>(runner, sizes?)`

The primary N+1 regression guard. Runs `runner(smallPageSize)` and
`runner(largePageSize)` and asserts the query count is identical.

```ts
import { assertConstantQueryCount } from '../../src/common/testing/queryCounter.js';

it('fires constant queries regardless of page size', async () => {
  await assertConstantQueryCount(async (pageSize) => {
    return analyticsService.getTopTippers(1, pageSize);
  });
});
```

Default sizes are `[1, 50]`. Override for endpoints with smaller max limits:

```ts
await assertConstantQueryCount(runner, [1, 10]);
```

## How It Works

The helper uses Node.js `AsyncLocalStorage` to create a per-call context that is
transparently propagated through all async continuations — including `await` chains,
`Promise.all`, and `setTimeout`. A Prisma `$use` middleware registered on the
singleton client intercments the counter for every database operation in the active context.

```
assertConstantQueryCount(runner)
  └── countQueries(runner(small))        ← ALS context #1
        └── queryCounterMiddleware()     ← increments ctx #1
  └── countQueries(runner(large))        ← ALS context #2
        └── queryCounterMiddleware()     ← increments ctx #2
  └── assert(count1 === count2)
```

Since the `AsyncLocalStorage` context is isolated per `storage.run()` call,
concurrent `countQueries` calls never interfere with each other.

## Registered Patterns (issue #1243 initial pass)

| Location | Pattern fixed |
|---|---|
| `profiles.service.ts` `listProfiles` | `users.map(u => getTipStats(u.id))` → single `tip.groupBy({ toAddress: { in: addresses } })` |
| `analytics.service.ts` `getTopTippers` | `grouped.map(row => user.findUnique(...))` → single `user.findMany({ stellarAddress: { in: addresses } })` |
| `analytics.service.ts` `getCreatorAnalytics` topTippers | `sortedTippers.map(([addr]) => user.findUnique(...))` → single `user.findMany({ stellarAddress: { in: tipperAddresses } })` |

## Adding Coverage for New Endpoints

Whenever you add or modify a list endpoint:

1. Add a `describe` block to `tests/nPlusOne.test.ts`.
2. Use `assertConstantQueryCount` with realistic sizes.
3. If the endpoint calls services that rely on the database, mock the Prisma
   client or use the real one with a test database (see `vitest.setup.ts`).

```ts
describe('newModule.listItems — no N+1', () => {
  it('fires a constant number of queries for any page size', async () => {
    await assertConstantQueryCount(async (pageSize) => {
      return newModuleService.listItems({ page: 1, limit: pageSize });
    });
  });
});
```

## Running the Tests

```bash
# Unit tests only (no database required)
cd backend
npm test -- --testPathPattern="queryCounter|nPlusOne"

# Full test suite
npm test
```
