CREATE TABLE "TreasuryBalanceSnapshot" (
    "id" TEXT NOT NULL,
    "actualBalanceStroops" BIGINT NOT NULL,
    "expectedBalanceStroops" BIGINT NOT NULL,
    "discrepancyStroops" BIGINT NOT NULL,
    "unexpectedOutflowStroops" BIGINT NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL,
    "observedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "TreasuryBalanceSnapshot_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "TreasuryBalanceSnapshot_observedAt_idx" ON "TreasuryBalanceSnapshot"("observedAt");
CREATE INDEX "TreasuryBalanceSnapshot_status_observedAt_idx" ON "TreasuryBalanceSnapshot"("status", "observedAt");
