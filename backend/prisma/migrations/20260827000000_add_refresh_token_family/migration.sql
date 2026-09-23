-- Add family tracking for refresh token rotation and reuse detection (issue #080)
-- familyId ties all tokens derived from the same initial login into a lineage.
-- Reuse of a revoked token revokes the entire family (self-healing).

ALTER TABLE "RefreshToken" ADD COLUMN "familyId" TEXT NOT NULL DEFAULT '';

-- Backfill existing tokens: family is the session they belong to
UPDATE "RefreshToken" SET "familyId" = "sessionId" WHERE "familyId" = '';

ALTER TABLE "RefreshToken" ALTER COLUMN "familyId" DROP DEFAULT;

CREATE INDEX "RefreshToken_familyId_idx" ON "RefreshToken"("familyId");
