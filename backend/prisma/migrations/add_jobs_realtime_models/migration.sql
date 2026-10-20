-- Add AuditLog model for job execution tracking (issues #1289, #1288, #1287)
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "action" TEXT NOT NULL,
    "actorType" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "trigger" TEXT NOT NULL DEFAULT 'manual',
    "input" JSONB NOT NULL,
    "outcome" TEXT NOT NULL,
    "error" TEXT,
    "durationMs" INTEGER,
    "resourceId" TEXT,
    "resourceType" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes for audit log queries
CREATE INDEX "AuditLog_actorType_actorId_idx" ON "AuditLog"("actorType", "actorId");
CREATE INDEX "AuditLog_action_idx" ON "AuditLog"("action");
CREATE INDEX "AuditLog_outcome_idx" ON "AuditLog"("outcome");
CREATE INDEX "AuditLog_createdAt_idx" ON "AuditLog"("createdAt");
CREATE INDEX "AuditLog_resourceId_idx" ON "AuditLog"("resourceId");

-- Add QueueMetric model for queue depth monitoring (issue #1287)
CREATE TABLE "QueueMetric" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "queueName" TEXT NOT NULL,
    "waitingCount" INTEGER NOT NULL,
    "activeCount" INTEGER NOT NULL,
    "delayedCount" INTEGER NOT NULL,
    "failedCount" INTEGER NOT NULL,
    "oldestWaitingAge" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes for queue metric queries
CREATE INDEX "QueueMetric_queueName_createdAt_idx" ON "QueueMetric"("queueName", "createdAt");
CREATE INDEX "QueueMetric_createdAt_idx" ON "QueueMetric"("createdAt");
