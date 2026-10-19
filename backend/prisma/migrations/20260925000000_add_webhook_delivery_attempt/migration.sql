-- Store bounded diagnostics for every webhook delivery attempt. The existing
-- WebhookSubscription table is defined by migration 20260727123500 and is not
-- recreated here.
CREATE TABLE "WebhookDeliveryAttempt" (
    "id" TEXT NOT NULL,
    "deliveryId" TEXT NOT NULL,
    "attemptNumber" INTEGER NOT NULL,
    "responseCode" INTEGER,
    "responseBodyExcerpt" TEXT,
    "errorReason" TEXT,
    "attemptedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WebhookDeliveryAttempt_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "WebhookDeliveryAttempt_deliveryId_attemptNumber_key"
    ON "WebhookDeliveryAttempt"("deliveryId", "attemptNumber");

CREATE INDEX "WebhookDeliveryAttempt_deliveryId_attemptedAt_idx"
    ON "WebhookDeliveryAttempt"("deliveryId", "attemptedAt");

ALTER TABLE "WebhookDeliveryAttempt"
    ADD CONSTRAINT "WebhookDeliveryAttempt_deliveryId_fkey"
    FOREIGN KEY ("deliveryId") REFERENCES "WebhookDelivery"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
