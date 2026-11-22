-- Issue #1257: recent (ledger, hash) checkpoints per indexer topic, for
-- chain-reorg detection.
CREATE TABLE "LedgerCheckpoint" (
    "topic" TEXT NOT NULL,
    "ledger" INTEGER NOT NULL,
    "ledgerHash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LedgerCheckpoint_pkey" PRIMARY KEY ("topic", "ledger")
);

-- Newest-first scans per topic (detection walks checkpoints from the head).
CREATE INDEX "LedgerCheckpoint_topic_ledger_idx" ON "LedgerCheckpoint"("topic", "ledger" DESC);
