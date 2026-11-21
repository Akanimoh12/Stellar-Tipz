CREATE TABLE "ModerationAppeal" (
    "id" TEXT NOT NULL,
    "appellantId" TEXT NOT NULL,
    "moderationActionId" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "details" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "decision" TEXT,
    "reviewNotes" TEXT,
    "reviewedBy" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ModerationAppeal_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ModerationAppeal_appellantId_createdAt_idx" ON "ModerationAppeal"("appellantId", "createdAt");
CREATE INDEX "ModerationAppeal_status_createdAt_idx" ON "ModerationAppeal"("status", "createdAt");
CREATE INDEX "ModerationAppeal_moderationActionId_idx" ON "ModerationAppeal"("moderationActionId");
CREATE UNIQUE INDEX "ModerationAppeal_appellantId_moderationActionId_key" ON "ModerationAppeal"("appellantId", "moderationActionId");

ALTER TABLE "ModerationAppeal"
ADD CONSTRAINT "ModerationAppeal_appellantId_fkey"
FOREIGN KEY ("appellantId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
