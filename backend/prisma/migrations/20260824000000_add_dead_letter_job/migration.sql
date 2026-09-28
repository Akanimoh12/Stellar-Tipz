-- Add the DeadLetterJob model (issue #994) so background jobs that exhaust
-- all BullMQ retry attempts remain inspectable after BullMQ prunes them.

-- CreateTable
CREATE TABLE "DeadLetterJob" (
    "id" TEXT NOT NULL,
    "queue" TEXT NOT NULL,
    "jobId" TEXT,
    "jobName" TEXT NOT NULL,
    "data" JSONB,
    "failedReason" TEXT NOT NULL,
    "attemptsMade" INTEGER NOT NULL,
    "failedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DeadLetterJob_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DeadLetterJob_queue_idx" ON "DeadLetterJob"("queue");

-- CreateIndex
CREATE INDEX "DeadLetterJob_failedAt_idx" ON "DeadLetterJob"("failedAt");
