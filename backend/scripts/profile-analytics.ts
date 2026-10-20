#!/usr/bin/env tsx
/**
 * Profiles every analytics (and leaderboard) query against a realistically
 * seeded database (issue #1265).
 *
 * Usage (against a disposable database — `--seed` TRUNCATES Tip, User and
 * AnalyticsDaily):
 *
 *   DATABASE_URL=postgresql://... npx tsx scripts/profile-analytics.ts --seed
 *   DATABASE_URL=postgresql://... npx tsx scripts/profile-analytics.ts --runs=7
 *
 * `--seed` generates 10x the dataset documented in docs/INDEX_EXPLAIN.md
 * (200k tips / 50k users): 2,000,000 tips and 500,000 users over 365 days, with
 * skewed (Zipf-like) tipper and creator distributions, 90% CONFIRMED tips, and
 * one AnalyticsDaily rollup row per day. Override with SEED_TIPS / SEED_USERS /
 * SEED_CREATORS / SEED_DAYS.
 *
 * `--service=<path>` / `--leaderboard=<path>` profile alternative service
 * modules (used to record the "before" timings of the previous implementation).
 *
 * Seeding runs statements longer than the API's query timeout, so set
 * DATABASE_QUERY_TIMEOUT_MS=600000 for the `--seed` run.
 *
 * Redis is not needed: the cache layer degrades to the database when Redis is
 * unreachable, so the timings below are the uncached (cold) query cost.
 */
import { performance } from 'node:perf_hooks';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { prisma } from '../src/db/prisma.js';
import { countQueries, queryCounterMiddleware } from '../src/common/testing/queryCounter.js';

const args = new Map(
  process.argv.slice(2).map((arg) => {
    const [key, value] = arg.replace(/^--/, '').split('=');
    return [key, value ?? 'true'] as const;
  }),
);

const TIPS = Number(process.env.SEED_TIPS ?? 2_000_000);
const USERS = Number(process.env.SEED_USERS ?? 500_000);
const CREATORS = Number(process.env.SEED_CREATORS ?? 50_000);
const DAYS = Number(process.env.SEED_DAYS ?? 365);
const RUNS = Number(args.get('runs') ?? 5);

/** Deterministic Stellar-like address for user n (56 chars, starts with G). */
const address = (n: string) => `'G' || upper(substr(md5(${n}::text) || md5((${n})::text || 'x'), 1, 55))`;

async function seed(): Promise<void> {
  console.log(`Seeding ${USERS} users, ${TIPS} tips over ${DAYS} days (${CREATORS} creators)...`);
  const started = performance.now();
  await prisma.$executeRawUnsafe(`TRUNCATE "Tip", "AnalyticsDaily", "LeaderboardSnapshot", "User" RESTART IDENTITY CASCADE`);
  // Bulk-load without per-row secondary index maintenance, then rebuild the
  // exact same indexes from their definitions.
  const indexes = await prisma.$queryRawUnsafe<Array<{ indexname: string; indexdef: string }>>(
    `SELECT indexname, indexdef FROM pg_indexes
     WHERE tablename IN ('Tip', 'User') AND indexdef NOT LIKE 'CREATE UNIQUE%'`,
  );
  for (const { indexname } of indexes) await prisma.$executeRawUnsafe(`DROP INDEX "${indexname}"`);
  await prisma.$executeRawUnsafe(`
    INSERT INTO "User" ("id", "stellarAddress", "username", "displayName", "createdAt", "updatedAt")
    SELECT 'u' || n, ${address('n')}, 'user_' || n, 'User ' || n,
           now() - (random() * ${DAYS} || ' days')::interval, now()
    FROM generate_series(1, ${USERS}) AS n`);
  // Tippers and creators are drawn with a cubic skew toward low ids, so a few
  // accounts dominate volume (as popular creators do in production).
  // Each random draw happens once per row in the inner query (an address is
  // derived from its index twice, so the index must not be re-drawn).
  await prisma.$executeRawUnsafe(`
    INSERT INTO "Tip" ("id", "txHash", "ledger", "fromAddress", "toAddress", "amountStroops", "status", "createdAt")
    SELECT 't' || n,
           md5('tx' || n),
           (1000000 + n)::int,
           ${address('tipper')},
           ${address('creator')},
           (1000000 + floor(random() * 999000000))::bigint,
           (CASE WHEN r < 0.90 THEN 'CONFIRMED' WHEN r < 0.95 THEN 'PENDING' ELSE 'REFUNDED' END)::"TipStatus",
           now() - ((${TIPS} - n)::float / ${TIPS} * ${DAYS} || ' days')::interval
    FROM (
      SELECT n, random() AS r,
             1 + floor(pow(random(), 3) * ${USERS})::int AS tipper,
             1 + floor(pow(random(), 3) * ${CREATORS})::int AS creator
      FROM generate_series(1, ${TIPS}) AS n
    ) AS s`);
  for (const { indexdef } of indexes) await prisma.$executeRawUnsafe(indexdef);
  await prisma.$executeRawUnsafe(`
    INSERT INTO "AnalyticsDaily" ("id", "date", "totalTips", "totalVolume", "newUsers", "activeUsers", "updatedAt")
    SELECT 'a' || d::date, d::date,
           (SELECT COUNT(*) FROM "Tip" WHERE "status" = 'CONFIRMED' AND "createdAt" >= d AND "createdAt" < d + interval '1 day'),
           (SELECT COALESCE(SUM("amountStroops"), 0) FROM "Tip" WHERE "status" = 'CONFIRMED' AND "createdAt" >= d AND "createdAt" < d + interval '1 day'),
           (SELECT COUNT(*) FROM "User" WHERE "createdAt" >= d AND "createdAt" < d + interval '1 day'),
           (SELECT COUNT(*) FROM (SELECT "fromAddress" FROM "Tip" WHERE "status" = 'CONFIRMED' AND "createdAt" >= d AND "createdAt" < d + interval '1 day'
                                  UNION SELECT "toAddress" FROM "Tip" WHERE "status" = 'CONFIRMED' AND "createdAt" >= d AND "createdAt" < d + interval '1 day') AS a),
           now()
    FROM generate_series(date_trunc('day', now() - interval '${DAYS} days'), date_trunc('day', now() - interval '1 day'), interval '1 day') AS d`);
  await prisma.$executeRawUnsafe(`ANALYZE "Tip"; `);
  await prisma.$executeRawUnsafe(`ANALYZE "User"; `);
  await prisma.$executeRawUnsafe(`ANALYZE "AnalyticsDaily"; `);
  console.log(`Seeded in ${((performance.now() - started) / 1000).toFixed(1)}s`);
}

async function rowCounts(): Promise<Record<string, number>> {
  const [row] = await prisma.$queryRawUnsafe<Array<Record<string, bigint>>>(`
    SELECT (SELECT COUNT(*) FROM "Tip") AS tips,
           (SELECT COUNT(*) FROM "Tip" WHERE "status" = 'CONFIRMED') AS confirmed_tips,
           (SELECT COUNT(*) FROM "User") AS users,
           (SELECT COUNT(*) FROM (SELECT 1 FROM "Tip" GROUP BY "toAddress") AS c) AS creators,
           (SELECT COUNT(*) FROM (SELECT 1 FROM "Tip" GROUP BY "fromAddress") AS t) AS tippers,
           (SELECT COUNT(*) FROM "AnalyticsDaily") AS rollup_days`);
  return Object.fromEntries(Object.entries(row).map(([k, v]) => [k, Number(v)]));
}

interface Case {
  name: string;
  run: () => Promise<unknown>;
}

function percentile(sorted: number[], p: number): number {
  return sorted[Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1)];
}

async function main(): Promise<void> {
  prisma.$use(queryCounterMiddleware);
  if (args.has('seed')) await seed();

  const servicePath = resolve(args.get('service') ?? 'src/modules/analytics/analytics.service.ts');
  const analytics = await import(pathToFileURL(servicePath).href);
  const leaderboardPath = resolve(args.get('leaderboard') ?? 'src/modules/leaderboard/leaderboard.service.ts');
  const leaderboard = await import(pathToFileURL(leaderboardPath).href);

  const [topCreator] = await prisma.$queryRawUnsafe<Array<{ toAddress: string }>>(
    `SELECT "toAddress" FROM "Tip" GROUP BY "toAddress" ORDER BY COUNT(*) DESC LIMIT 1`,
  );
  const creator = await prisma.user.findUnique({ where: { stellarAddress: topCreator.toAddress } });
  const username = creator?.username ?? 'user_1';
  const yearAgo = new Date(Date.now() - 365 * 86_400_000);
  const yesterday = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);
  const ninetyDaysAgo = new Date(Date.now() - 90 * 86_400_000).toISOString().slice(0, 10);

  const cases: Case[] = [
    { name: 'daily (30 rows)', run: () => analytics.getDailyAnalytics(undefined, undefined, 30, 0) },
    { name: 'summary (all time)', run: () => analytics.getAnalyticsSummary(undefined, undefined) },
    { name: 'summary (90 days)', run: () => analytics.getAnalyticsSummary(ninetyDaysAgo, undefined) },
    { name: 'volume day (30 days)', run: () => analytics.getTipVolume('day') },
    { name: 'volume week (365 days)', run: () => analytics.getTipVolume('week', yearAgo.toISOString()) },
    { name: 'volume month (365 days)', run: () => analytics.getTipVolume('month', yearAgo.toISOString()) },
    // Scheduled rollup rebuild (new implementation only); runs before the reads it serves.
    ...(analytics.refreshTipperRollup
      ? [{ name: 'top-tippers rollup rebuild (job)', run: () => analytics.refreshTipperRollup() }]
      : []),
    { name: 'top tippers (page 1)', run: () => analytics.getTopTippers(1, 20) },
    { name: 'top tippers (page 50)', run: () => analytics.getTopTippers(50, 20) },
    { name: 'active users day (30 days)', run: () => analytics.getActiveUsers('day') },
    { name: 'active users month (365 days)', run: () => analytics.getActiveUsers('month', yearAgo.toISOString()) },
    { name: `creator analytics (top creator, 30 days)`, run: () => analytics.getCreatorAnalytics(username, undefined, undefined, 'day') },
    {
      name: `creator analytics (top creator, 365 days)`,
      run: () => analytics.getCreatorAnalytics(username, yearAgo.toISOString().slice(0, 10), undefined, 'week'),
    },
    { name: 'daily rollup job (1 day)', run: () => analytics.computeDailyAnalytics(yesterday) },
    { name: 'leaderboard all-time (page 1)', run: () => leaderboard.getLeaderboard('all', 20, 0) },
    { name: 'leaderboard 7d (page 1)', run: () => leaderboard.getLeaderboard('7d', 20, 0) },
    { name: 'leaderboard user rank (all-time)', run: () => leaderboard.getUserRank(creator?.id ?? 'u1', 'all') },
  ];

  console.log('\nRow counts:', await rowCounts());
  console.log(`\n| Query | p50 ms | p95 ms | max ms | DB queries |\n|---|---:|---:|---:|---:|`);
  for (const testCase of cases) {
    const timings: number[] = [];
    let queries = 0;
    try {
      await testCase.run(); // warm-up (plan cache, buffers)
      for (let i = 0; i < RUNS; i++) {
        const started = performance.now();
        const { count } = await countQueries(testCase.run);
        timings.push(performance.now() - started);
        queries = count;
      }
    } catch (err) {
      console.log(`| ${testCase.name} | error: ${(err as Error).message.split('\n')[0]} | | | |`);
      continue;
    }
    timings.sort((a, b) => a - b);
    const fmt = (n: number) => n.toFixed(1);
    console.log(
      `| ${testCase.name} | ${fmt(percentile(timings, 50))} | ${fmt(percentile(timings, 95))} | ${fmt(timings[timings.length - 1])} | ${queries} |`,
    );
  }
  await prisma.$disconnect();
  process.exit(0);
}

main().catch(async (err) => {
  console.error(err);
  await prisma.$disconnect();
  process.exit(1);
});
