-- AlterTable: Remove usedAt from AuthChallenge.
-- Single-use enforcement now uses atomic DELETE (deleteMany) instead of soft-marking.
ALTER TABLE "AuthChallenge" DROP COLUMN IF EXISTS "usedAt";
