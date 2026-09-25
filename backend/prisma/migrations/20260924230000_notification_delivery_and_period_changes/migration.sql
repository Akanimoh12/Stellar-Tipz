ALTER TABLE "NotificationPreference"
  ADD COLUMN "batchingEnabled" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "batchingWindowSeconds" INTEGER NOT NULL DEFAULT 300,
  ADD CONSTRAINT "NotificationPreference_batching_window" CHECK ("batchingWindowSeconds" BETWEEN 10 AND 86400);

ALTER TABLE "Subscription"
  ADD COLUMN "pendingAmountStroops" BIGINT,
  ADD COLUMN "pendingInterval" "SubscriptionInterval",
  ADD COLUMN "changeEffectiveAt" TIMESTAMP(3),
  ADD CONSTRAINT "Subscription_pending_change" CHECK (
    ("pendingAmountStroops" IS NULL AND "pendingInterval" IS NULL AND "changeEffectiveAt" IS NULL) OR
    ("pendingAmountStroops" IS NOT NULL AND "pendingAmountStroops" > 0 AND "pendingInterval" IS NOT NULL AND "changeEffectiveAt" IS NOT NULL));

CREATE TABLE "NotificationBatch" (
  "id" TEXT PRIMARY KEY,
  "userId" TEXT NOT NULL REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "type" TEXT NOT NULL,
  "tokenCode" TEXT NOT NULL,
  "count" INTEGER NOT NULL DEFAULT 0,
  "totalStroops" BIGINT NOT NULL DEFAULT 0,
  "dueAt" TIMESTAMP(3) NOT NULL
);
CREATE INDEX "NotificationBatch_dueAt_idx" ON "NotificationBatch"("dueAt");
CREATE TYPE "NotificationChannel" AS ENUM ('in_app', 'email', 'push');
CREATE TYPE "NotificationDeliveryStatus" AS ENUM ('queued', 'sent', 'delivered', 'failed', 'bounced');
CREATE TABLE "NotificationDelivery" (
  "id" TEXT PRIMARY KEY,
  "userId" TEXT NOT NULL REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "notificationId" TEXT REFERENCES "Notification"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "channel" "NotificationChannel" NOT NULL,
  "status" "NotificationDeliveryStatus" NOT NULL DEFAULT 'queued',
  "reason" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "NotificationDelivery_failure_reason" CHECK ("status" NOT IN ('failed', 'bounced') OR ("reason" IS NOT NULL AND length(trim("reason")) > 0))
);
CREATE INDEX "NotificationDelivery_channel_status_idx" ON "NotificationDelivery"("channel", "status");
CREATE INDEX "NotificationDelivery_notificationId_idx" ON "NotificationDelivery"("notificationId");
CREATE TABLE "NotificationChannelState" (
  "userId" TEXT NOT NULL REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "channel" "NotificationChannel" NOT NULL,
  "consecutiveFailures" INTEGER NOT NULL DEFAULT 0,
  "disabledAt" TIMESTAMP(3),
  PRIMARY KEY ("userId", "channel")
);
