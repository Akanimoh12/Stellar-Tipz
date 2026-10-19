-- Audit: indexes matching real where/orderBy patterns + concurrency version columns
-- In production, run CREATE INDEX CONCURRENTLY outside a transaction to avoid locking:
--   CREATE INDEX CONCURRENTLY "User_deletedAt_createdAt_idx" ON "User"("deletedAt", "createdAt");
-- Prisma migrate runs inside a transaction, so this migration uses plain CREATE INDEX.
-- For zero-downtime on large tables, apply the CONCURRENTLY variant manually before deploying.

-- Add version columns for optimistic locking (lost-update prevention)
ALTER TABLE "Streak" ADD COLUMN IF NOT EXISTS "version" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Goal" ADD COLUMN IF NOT EXISTS "version" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "AnalyticsDaily" ADD COLUMN IF NOT EXISTS "version" INTEGER NOT NULL DEFAULT 0;

-- CreateIndex: User (deletedAt null filter + orderBy createdAt)
CREATE INDEX IF NOT EXISTS "User_deletedAt_createdAt_idx" ON "User"("deletedAt", "createdAt");

-- CreateIndex: Tip (status equality before range/sort)
CREATE INDEX IF NOT EXISTS "Tip_status_createdAt_idx" ON "Tip"("status", "createdAt");
CREATE INDEX IF NOT EXISTS "Tip_status_toAddress_idx" ON "Tip"("status", "toAddress");
CREATE INDEX IF NOT EXISTS "Tip_status_fromAddress_idx" ON "Tip"("status", "fromAddress");
CREATE INDEX IF NOT EXISTS "Tip_tokenCode_idx" ON "Tip"("tokenCode");
CREATE INDEX IF NOT EXISTS "Tip_toAddress_tokenCode_createdAt_idx" ON "Tip"("toAddress", "tokenCode", "createdAt");
CREATE INDEX IF NOT EXISTS "Tip_fromAddress_tokenCode_createdAt_idx" ON "Tip"("fromAddress", "tokenCode", "createdAt");

-- CreateIndex: Withdrawal (userId equality before status/requestedAt)
CREATE INDEX IF NOT EXISTS "Withdrawal_userId_status_idx" ON "Withdrawal"("userId", "status");
CREATE INDEX IF NOT EXISTS "Withdrawal_userId_requestedAt_idx" ON "Withdrawal"("userId", "requestedAt");
CREATE INDEX IF NOT EXISTS "Withdrawal_status_idx" ON "Withdrawal"("status");

-- CreateIndex: EventLog composites
CREATE INDEX IF NOT EXISTS "EventLog_topic_ledger_idx" ON "EventLog"("topic", "ledger");
CREATE INDEX IF NOT EXISTS "EventLog_ledger_topic_idx" ON "EventLog"("ledger", "topic");

-- CreateIndex: Notification (userId equality before sort)
CREATE INDEX IF NOT EXISTS "Notification_userId_createdAt_idx" ON "Notification"("userId", "createdAt");
CREATE INDEX IF NOT EXISTS "Notification_userId_readAt_createdAt_idx" ON "Notification"("userId", "readAt", "createdAt");

-- CreateIndex: AuthChallenge (equality stellarAddress, network before range expiresAt)
CREATE INDEX IF NOT EXISTS "AuthChallenge_stellarAddress_network_idx" ON "AuthChallenge"("stellarAddress", "network");
CREATE INDEX IF NOT EXISTS "AuthChallenge_stellarAddress_network_expiresAt_idx" ON "AuthChallenge"("stellarAddress", "network", "expiresAt");
CREATE INDEX IF NOT EXISTS "AuthChallenge_stellarAddress_network_usedAt_idx" ON "AuthChallenge"("stellarAddress", "network", "usedAt");

-- CreateIndex: Goal composites
CREATE INDEX IF NOT EXISTS "Goal_userId_status_idx" ON "Goal"("userId", "status");

-- CreateIndex: CreditScoreHistory (userId + orderBy computedAt)
CREATE INDEX IF NOT EXISTS "CreditScoreHistory_userId_computedAt_idx" ON "CreditScoreHistory"("userId", "computedAt");
