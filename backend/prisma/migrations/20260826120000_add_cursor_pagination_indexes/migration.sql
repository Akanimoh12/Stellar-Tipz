CREATE INDEX "Tip_createdAt_id_idx" ON "Tip"("createdAt", "id");
CREATE INDEX "Tip_toAddress_createdAt_id_idx" ON "Tip"("toAddress", "createdAt", "id");
CREATE INDEX "Tip_fromAddress_createdAt_id_idx" ON "Tip"("fromAddress", "createdAt", "id");
CREATE INDEX "Withdrawal_userId_requestedAt_id_idx" ON "Withdrawal"("userId", "requestedAt", "id");
CREATE INDEX "Refund_createdAt_id_idx" ON "Refund"("createdAt", "id");
CREATE INDEX "Notification_userId_createdAt_id_idx" ON "Notification"("userId", "createdAt", "id");
CREATE INDEX "Subscription_tipperId_createdAt_id_idx" ON "Subscription"("tipperId", "createdAt", "id");
CREATE INDEX "Subscription_creatorId_createdAt_id_idx" ON "Subscription"("creatorId", "createdAt", "id");
