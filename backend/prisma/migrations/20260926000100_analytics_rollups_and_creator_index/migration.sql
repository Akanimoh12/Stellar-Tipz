-- Issue #1265: ranked per-tipper totals, rebuilt by the analytics rollup job,
-- so the top-tippers endpoint no longer aggregates the whole Tip table per request.
-- Keyed by rank only: pages are read by rank, and a rebuild inserts in rank
-- order so the single B-tree is append-only.
CREATE TABLE "TipperRollup" (
    "rank" INTEGER NOT NULL,
    "fromAddress" TEXT NOT NULL,
    "totalStroops" BIGINT NOT NULL,
    "tipCount" INTEGER NOT NULL,
    "refreshedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TipperRollup_pkey" PRIMARY KEY ("rank")
);

-- Issue #1265: creator analytics filter on (toAddress, status, createdAt) and
-- aggregate amountStroops/fromAddress; covering them allows an index-only scan
-- (441 ms -> 165 ms for the busiest creator's year at 2M tips, see
-- docs/ANALYTICS_PERFORMANCE.md).
-- Prisma runs migrations in a transaction, so this uses plain CREATE INDEX.
-- For zero-downtime on a large Tip table, create it beforehand with:
--   CREATE INDEX CONCURRENTLY "Tip_toAddress_status_createdAt_cover_idx"
--     ON "Tip"("toAddress", "status", "createdAt") INCLUDE ("amountStroops", "fromAddress");
CREATE INDEX IF NOT EXISTS "Tip_toAddress_status_createdAt_cover_idx"
    ON "Tip"("toAddress", "status", "createdAt") INCLUDE ("amountStroops", "fromAddress");
