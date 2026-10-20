-- Issue #1263: fencing token for indexer leader election. Each cursor write
-- records the epoch of the leader that made it; a write with a lower epoch
-- (a deposed leader resuming after a pause) is rejected. Adding a column with
-- a constant default is a metadata-only change in Postgres 11+ (no rewrite).
ALTER TABLE "IndexerCursor" ADD COLUMN "leaderEpoch" INTEGER NOT NULL DEFAULT 0;
