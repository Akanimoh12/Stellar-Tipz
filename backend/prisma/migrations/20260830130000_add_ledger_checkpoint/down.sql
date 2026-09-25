-- Down migration for 20260830130000_add_ledger_checkpoint (issue #1257).
-- LedgerCheckpoint holds only a short trailing window of derived
-- (ledger, hash) pairs — nothing user-authored — so dropping it is safe;
-- the indexer rebuilds the window on its next ticks.
DROP TABLE IF EXISTS "LedgerCheckpoint";
