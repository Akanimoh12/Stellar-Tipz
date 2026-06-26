-- CreateIndex
CREATE INDEX "User_createdAt_idx" ON "User"("createdAt");

-- CreateIndex
CREATE INDEX "Tip_toAddress_createdAt_idx" ON "Tip"("toAddress", "createdAt");

-- CreateIndex
CREATE INDEX "Tip_fromAddress_createdAt_idx" ON "Tip"("fromAddress", "createdAt");

-- CreateIndex
CREATE INDEX "Notification_createdAt_idx" ON "Notification"("createdAt");

-- CreateIndex
CREATE INDEX "LeaderboardSnapshot_period_rank_idx" ON "LeaderboardSnapshot"("period", "rank");

-- CreateIndex
CREATE INDEX "Goal_status_idx" ON "Goal"("status");
