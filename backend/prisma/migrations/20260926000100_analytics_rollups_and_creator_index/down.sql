-- Down migration for 20260926000100_analytics_rollups_and_creator_index (issue #1265).
-- Both objects are derived: the top-tippers endpoint falls back to aggregating
-- Tip when the rollup table is absent, and the index is a pure accelerator.
DROP INDEX IF EXISTS "Tip_toAddress_status_createdAt_cover_idx";
DROP TABLE IF EXISTS "TipperRollup";
