# Analytics query performance (issue #1265)

Every analytics query was profiled against a dataset **10× the volume documented
in [INDEX_EXPLAIN.md](./INDEX_EXPLAIN.md)** (200k tips / 50k users), before and
after this change. Reproduce with `scripts/profile-analytics.ts`.

## Method

- **Database:** PostgreSQL 16.14, default configuration (`shared_buffers`
  128 MB, `work_mem` 4 MB), with every `Tip`/`User` index the migrations create.
  Laptop-class machine: 4 cores, 11 GB RAM.
- **Dataset** (`--seed`), skewed like real traffic (a few accounts dominate):

  | Table / measure | Rows |
  |---|---:|
  | `Tip` | 2,000,000 (1,799,349 `CONFIRMED`, the rest `PENDING`/`REFUNDED`) over 365 days |
  | `User` | 500,000 |
  | Distinct creators (`toAddress`) | 50,000 |
  | Distinct tippers (`fromAddress`) | 439,813 |
  | `AnalyticsDaily` rollup rows | 365 |
  | Busiest creator | ~54,000 tips / year |

- **Measurement:** each service function is called once to warm up, then timed
  over 5 runs (3 for the slow "before" code) end to end, including JS
  post-processing. "DB queries" is counted by the `queryCounterMiddleware`.
  Redis is not running, so these are **uncached** (cold) timings.
- **Threshold:** 250 ms p95 per request-path query at this volume. Queries over
  it were optimized, and where that was not enough, moved to precomputed rollups.

```bash
DATABASE_QUERY_TIMEOUT_MS=600000 DATABASE_URL=postgresql://…/disposable \
  npx tsx scripts/profile-analytics.ts --seed      # seed, then profile
DATABASE_URL=postgresql://…/disposable npx tsx scripts/profile-analytics.ts --runs=5
```

## Results

| Query | Before p50 / p95 (ms) | Before queries | After p50 / p95 (ms) | After queries |
|---|---:|---:|---:|---:|
| daily (30 rows) | 1.7 / 3.1 † | 2 | 3.2 / 4.9 | 2 |
| summary (all time) | 7.5 / 9.0 † | 1 | 1.1 / 1.6 | 1 |
| summary (90 days) | 2.2 / 2.4 † | 1 | 1.2 / 1.3 | 1 |
| volume, day (30 days) | 1,199 / 1,257 | 1 | 8.4 / 8.5 | 2 |
| volume, week (365 days) | 17,423 / 29,466 | 1 | 12.1 / 12.8 | 2 |
| volume, month (365 days) | 16,309 / 16,961 | 1 | 9.0 / 10.2 | 2 |
| top tippers (page 1) | 5,960 / 9,589 | **22** | 5.3 / 6.8 | 3 |
| top tippers (page 50) | 5,302 / 5,792 | **22** | 2.9 / 3.6 | 3 |
| active users, day (30 days) | 1.6 / 1.6 † | 1 | 2.0 / 2.0 | 1 |
| active users, month (365 days) | 5.7 / 5.8 † | 1 | 7.2 / 7.6 | 1 |
| creator analytics, busiest creator (30 days) | 49.8 / 50.3 | **12** | 18.1 / 36.0 | 5 |
| creator analytics, busiest creator (365 days) | 680 / 683 | **12** | 191 / 207 | 5 |
| daily rollup job (1 day) | 41.8 / 72.6 | 5 | 54.0 / 74.5 | 4 |
| *top-tippers rollup rebuild (background job)* | — | — | 8,448 / 10,145 | 3 |

† Only with the `AnalyticsDaily` Prisma model restored. On the base branch the
model had been dropped from `schema.prisma` in a merge (`bfebc5e`), so these
endpoints and the rollup job threw at runtime.

Every request-path query is now under the threshold, with a fixed number of
queries regardless of result size (asserted by the regression tests).

## What changed

| Query | Problem | Fix |
|---|---|---|
| volume | Loaded every confirmed tip in the range into memory and bucketed in JS (~1.8M rows for a year) | Whole UTC days that the rollup job has finished come from `AnalyticsDaily`; only partial edge days, today, and days without a finished rollup row are aggregated from `Tip`, with `GROUP BY` bucketing in SQL. Results are identical (checked against the previous algorithm in `analytics.db.test.ts`). |
| top tippers | `groupBy` over every tip per request, a total computed by fetching every group, and one `findUnique` per row (N+1) | Ranked `TipperRollup` table rebuilt by the `tipper-rollup` job (`ANALYTICS_TIPPER_ROLLUP_CRON`, every 10 min), read one page at a time by rank; one batched profile lookup. Until the first rebuild it falls back to a live SQL aggregate. |
| creator analytics | Loaded every tip the creator received into memory; one `findUnique` per top tipper (N+1) | Summary, time series and top tippers aggregated in SQL (3 queries) plus one batched profile lookup; covering index `Tip(toAddress, status, createdAt) INCLUDE (amountStroops, fromAddress)` enables an index-only scan (441 → 165 ms for the raw scan). |
| summary | Loaded every rollup row to sum in JS | One `aggregate({ _sum })` |
| daily rollup job | Four queries fetching every tip of the day (and distinct sender/receiver lists) | Two SQL aggregates (`COUNT`/`SUM`, `UNION` for active users) plus a user count |
| distinct counts | `COUNT(DISTINCT addr)` sorts every row with the locale collation (4.3 s for 200k tips) | Hashed `COUNT(*)` over a `GROUP BY` subquery, or `COLLATE "C"` where `COUNT(DISTINCT)` is inherent |

Ties are ordered deterministically everywhere (`… DESC, address COLLATE "C"`),
so paging is stable.

## Rollup freshness

- `AnalyticsDaily` rows are used for a day only once the rollup job has
  rewritten that day after it ended (`updatedAt >= date + 1 day`), so a day with
  only live increments is always read from `Tip`. As with `/analytics/daily`, a
  tip confirmed or refunded after its day was rolled up appears once that day is
  recomputed.
- The top-tippers ranking is at most `ANALYTICS_TIPPER_ROLLUP_CRON` old
  (10 min by default). The rebuild runs in one transaction with `DELETE`, not
  `TRUNCATE`, so readers keep the previous ranking and are never blocked.

## Caching

Results are cached on top of this with documented TTLs and explicit
invalidation; see [CACHING.md](./CACHING.md).

## Regression tests

- `src/modules/analytics/analytics.test.ts` (hermetic): exact query count per
  endpoint, constant counts for any page size or tipper count (N+1 guard), and
  bounded service time when the database reports large aggregates.
- `src/modules/analytics/analytics.db.test.ts` (live Postgres, see
  `src/common/testing/liveServices.ts`): SQL results equal the previous
  in-memory algorithm, with and without rollup rows, and on 200k tips every
  endpoint stays within its time budget and fixed query count.

## Out of scope: leaderboard

The leaderboard endpoints aggregate `Tip` live as well. At this volume the
all-time page and a single user's rank take about 1 s cold (before: 1.1 s and
1.4 s); the 24 h / 7 d windows take about 40 ms. Serving the all-time board from
the existing `LeaderboardSnapshot` table would bring it in line; that is a
follow-up to #1269's ordering and pagination work rather than part of this
analytics change.
