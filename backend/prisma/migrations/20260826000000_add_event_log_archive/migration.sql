CREATE TABLE "EventLogArchive" (
    "id" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "topic" TEXT NOT NULL,
    "ledger" INTEGER NOT NULL,
    "txHash" TEXT NOT NULL,
    "data" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL,
    "archivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EventLogArchive_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "EventLogArchive_sourceId_key" ON "EventLogArchive"("sourceId");
CREATE INDEX "EventLogArchive_topic_idx" ON "EventLogArchive"("topic");
CREATE INDEX "EventLogArchive_ledger_idx" ON "EventLogArchive"("ledger");
CREATE INDEX "EventLogArchive_createdAt_idx" ON "EventLogArchive"("createdAt");