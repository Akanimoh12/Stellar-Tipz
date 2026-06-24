-- CreateEnum
CREATE TYPE "TipStatus" AS ENUM ('CONFIRMED', 'PENDING', 'REFUNDED');

-- CreateEnum
CREATE TYPE "WithdrawalStatus" AS ENUM ('PENDING', 'CONFIRMED', 'FAILED');

-- AlterTable
ALTER TABLE "User" ADD COLUMN "displayName" TEXT,
ADD COLUMN "bio" TEXT,
ADD COLUMN "imageUrl" TEXT,
ADD COLUMN "avatarCid" TEXT,
ADD COLUMN "xHandle" TEXT;

-- DropIndex
DROP INDEX IF EXISTS "User_username_key";

-- CreateIndex
CREATE UNIQUE INDEX "User_username_key" ON "User"(LOWER("username"));

-- AlterTable
ALTER TABLE "Tip" ADD COLUMN "networkFee" BIGINT NOT NULL DEFAULT 0,
ADD COLUMN "tokenCode" TEXT NOT NULL DEFAULT 'XLM',
ADD COLUMN "isAnonymous" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "status" "TipStatus" NOT NULL DEFAULT 'PENDING',
ADD COLUMN "senderId" TEXT,
ADD COLUMN "recipientId" TEXT;

-- AddForeignKey
ALTER TABLE "Tip" ADD CONSTRAINT "Tip_senderId_fkey" FOREIGN KEY ("senderId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Tip" ADD CONSTRAINT "Tip_recipientId_fkey" FOREIGN KEY ("recipientId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- CreateTable
CREATE TABLE "CreditScore" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "value" INTEGER NOT NULL,
    "computedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CreditScore_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CreditScoreHistory" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "value" INTEGER NOT NULL,
    "computedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CreditScoreHistory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Withdrawal" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "amount" BIGINT NOT NULL,
    "fee" BIGINT NOT NULL,
    "txHash" TEXT,
    "status" "WithdrawalStatus" NOT NULL DEFAULT 'PENDING',
    "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "confirmedAt" TIMESTAMP(3),

    CONSTRAINT "Withdrawal_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CreditScore_userId_key" ON "CreditScore"("userId");

-- CreateIndex
CREATE INDEX "CreditScoreHistory_userId_idx" ON "CreditScoreHistory"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "Withdrawal_txHash_key" ON "Withdrawal"("txHash");

-- CreateIndex
CREATE INDEX "Withdrawal_userId_idx" ON "Withdrawal"("userId");

-- AddForeignKey
ALTER TABLE "CreditScore" ADD CONSTRAINT "CreditScore_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CreditScoreHistory" ADD CONSTRAINT "CreditScoreHistory_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Withdrawal" ADD CONSTRAINT "Withdrawal_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
