-- Add rotation and expiry support to ApiKey.
-- Issue #1218: API key scoping and rotation.

-- Rotation: previous key hash + grace window.
ALTER TABLE "ApiKey" ADD COLUMN "previousHashedKey" TEXT;
ALTER TABLE "ApiKey" ADD COLUMN "previousGraceExpiresAt" TIMESTAMP(3);

-- Expiry and usage tracking.
ALTER TABLE "ApiKey" ADD COLUMN "expiresAt" TIMESTAMP(3);
ALTER TABLE "ApiKey" ADD COLUMN "lastUsedAt" TIMESTAMP(3);

-- Uniqueness and lookup indexes.
CREATE UNIQUE INDEX "ApiKey_previousHashedKey_key" ON "ApiKey"("previousHashedKey");
