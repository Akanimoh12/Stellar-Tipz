-- Add metadata required for user-facing session management.
ALTER TABLE "RefreshToken"
ADD COLUMN "sessionId" TEXT NOT NULL DEFAULT '',
ADD COLUMN "device" TEXT NOT NULL DEFAULT 'Unknown device',
ADD COLUMN "ipAddress" TEXT NOT NULL DEFAULT 'unknown',
ADD COLUMN "lastUsedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

UPDATE "RefreshToken" SET "sessionId" = "id" WHERE "sessionId" = '';

ALTER TABLE "RefreshToken"
ALTER COLUMN "sessionId" DROP DEFAULT,
ALTER COLUMN "device" DROP DEFAULT,
ALTER COLUMN "ipAddress" DROP DEFAULT,
ALTER COLUMN "lastUsedAt" DROP DEFAULT;

CREATE INDEX "RefreshToken_sessionId_idx" ON "RefreshToken"("sessionId");