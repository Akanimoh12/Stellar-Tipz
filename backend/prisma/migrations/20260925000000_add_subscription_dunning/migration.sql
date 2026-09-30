-- AlterEnum
ALTER TYPE "SubscriptionStatus" ADD VALUE 'PAST_DUE';
ALTER TYPE "SubscriptionStatus" ADD VALUE 'FAILED';

-- AlterTable
ALTER TABLE "Subscription"
ADD COLUMN "chargeFailureCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "dunningStartedAt" TIMESTAMP(3),
ADD COLUMN "nextChargeRetryAt" TIMESTAMP(3),
ADD COLUMN "lastChargeFailureReason" TEXT,
ADD COLUMN "chargeAttemptStartedAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "Subscription_status_nextChargeAt_idx" ON "Subscription"("status", "nextChargeAt");

-- CreateIndex
CREATE INDEX "Subscription_status_nextChargeRetryAt_idx" ON "Subscription"("status", "nextChargeRetryAt");
