-- Down migration for 20260926000000_add_indexer_leader_epoch (issue #1263).
-- The epoch is derived coordination state; dropping it only removes fencing
-- until the column is re-added (single-instance indexing is unaffected).
ALTER TABLE "IndexerCursor" DROP COLUMN IF EXISTS "leaderEpoch";
