#!/usr/bin/env tsx
/**
 * Script to generate EXPLAIN output before/after for top 5 queries.
 * Requires DATABASE_URL and a seeded DB (SEED_SCALE=large).
 * Usage: npx tsx backend/scripts/explain-indexes.ts
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const queries = [
  {
    name: "Q1 — Tip pagination (toAddress + createdAt)",
    sql: `EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT)
      SELECT "id","txHash","ledger","fromAddress","toAddress","amountStroops","status","createdAt"
      FROM "Tip"
      WHERE "toAddress" = 'GABC123' AND "createdAt" >= '2023-01-01'
      ORDER BY "createdAt" DESC, "id" DESC
      LIMIT 11;`,
  },
  {
    name: "Q2 — Leaderboard groupBy (status + createdAt)",
    sql: `EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT)
      SELECT "toAddress", SUM("amountStroops") FROM "Tip"
      WHERE "status" = 'CONFIRMED' AND "createdAt" >= NOW() - INTERVAL '7 days'
      GROUP BY "toAddress"
      ORDER BY SUM("amountStroops") DESC
      LIMIT 100;`,
  },
  {
    name: "Q3 — Withdrawable balance (tip sum)",
    sql: `EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT)
      SELECT SUM("amountStroops") FROM "Tip" WHERE "toAddress" = 'GABC123' AND "status" = 'CONFIRMED';`,
  },
  {
    name: "Q4 — Notifications",
    sql: `EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT)
      SELECT "id","type","payload","readAt","createdAt"
      FROM "Notification"
      WHERE "userId" = 'user_01' AND "readAt" IS NULL
      ORDER BY "createdAt" DESC
      LIMIT 20;`,
  },
  {
    name: "Q5 — User list (deletedAt + createdAt)",
    sql: `EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT)
      SELECT "id","stellarAddress","username","createdAt"
      FROM "User"
      WHERE "deletedAt" IS NULL
      ORDER BY "createdAt" DESC
      LIMIT 20 OFFSET 0;`,
  },
];

async function main() {
  console.log("# EXPLAIN output generated at", new Date().toISOString());
  for (const q of queries) {
    console.log(`\n## ${q.name}`);
    console.log("```");
    try {
      const rows = await prisma.$queryRawUnsafe(q.sql) as Array<{ "QUERY PLAN": string }>;
      for (const r of rows) {
        console.log(r["QUERY PLAN"]);
      }
    } catch (e) {
      console.error("Failed to EXPLAIN", q.name, e);
    }
    console.log("```");
  }
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
