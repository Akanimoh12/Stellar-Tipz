-- Add createdAt/updatedAt to every model that was missing them.
--
-- For updatedAt (managed by Prisma via @updatedAt, no DB default in the schema)
-- the column is first added with DEFAULT CURRENT_TIMESTAMP so existing rows are
-- backfilled, then the default is dropped so the database matches the schema
-- exactly and no drift is reported. createdAt keeps its default because the
-- schema declares @default(now()).

-- AlterTable
ALTER TABLE "Tip" ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "Tip" ALTER COLUMN  "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "IndexerCursor" ADD COLUMN     "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- AlterTable
ALTER TABLE "EventLog" ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "EventLog" ALTER COLUMN  "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "Refund" ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "Refund" ALTER COLUMN  "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "Notification" ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "Notification" ALTER COLUMN  "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "XAccount" ADD COLUMN     "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "XAccount" ALTER COLUMN  "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "LeaderboardSnapshot" ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "LeaderboardSnapshot" ALTER COLUMN  "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "AuthChallenge" ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "AuthChallenge" ALTER COLUMN  "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "RefreshToken" ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "RefreshToken" ALTER COLUMN  "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "AnalyticsDaily" ADD COLUMN     "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "AnalyticsDaily" ALTER COLUMN  "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "AuditLog" ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "AuditLog" ALTER COLUMN  "updatedAt" DROP DEFAULT;
