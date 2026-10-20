-- Discovery exclusions + scheduled-payout (auto-withdraw) support.
-- Issues #1216 (discovery), #1215 (platform stats), #1211 (payout scheduling).

-- Add discovery-exclusion flags to User.
ALTER TABLE "User" ADD COLUMN "deactivatedAt" TIMESTAMP(3);
ALTER TABLE "User" ADD COLUMN "blockedAt" TIMESTAMP(3);
ALTER TABLE "User" ADD COLUMN "flaggedUnverified" BOOLEAN NOT NULL DEFAULT false;

-- Add scheduled-payout failure notification preference.
ALTER TABLE "NotificationPreference" ADD COLUMN "payoutFailed" BOOLEAN NOT NULL DEFAULT true;

-- CreateTable PayoutSchedule
CREATE TABLE "PayoutSchedule" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "thresholdStroops" BIGINT NOT NULL DEFAULT 0,
    "cadence" TEXT NOT NULL DEFAULT 'MANUAL',
    "nextRunAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastRunAt" TIMESTAMP(3),
    "lastStatus" TEXT,
    "consecutiveFailures" INTEGER NOT NULL DEFAULT 0,
    "paused" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PayoutSchedule_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PayoutSchedule_userId_key" ON "PayoutSchedule"("userId");
CREATE INDEX "PayoutSchedule_enabled_paused_nextRunAt_idx" ON "PayoutSchedule"("enabled", "paused", "nextRunAt");

-- AddForeignKey
ALTER TABLE "PayoutSchedule" ADD CONSTRAINT "PayoutSchedule_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
