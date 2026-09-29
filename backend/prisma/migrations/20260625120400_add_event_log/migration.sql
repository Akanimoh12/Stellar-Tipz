-- CreateTable
CREATE TABLE "EventLog" (
    "id" TEXT NOT NULL,
    "topic" TEXT NOT NULL,
    "ledger" INTEGER NOT NULL,
    "txHash" TEXT NOT NULL,
    "data" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EventLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "EventLog_topic_idx" ON "EventLog"("topic");

-- CreateIndex
CREATE INDEX "EventLog_ledger_idx" ON "EventLog"("ledger");

-- CreateIndex
CREATE INDEX "EventLog_txHash_idx" ON "EventLog"("txHash");
