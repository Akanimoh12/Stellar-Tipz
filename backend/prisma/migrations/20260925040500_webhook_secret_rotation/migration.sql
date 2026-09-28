-- Keep the previous webhook signing secret temporarily valid during rotation.
ALTER TABLE "WebhookSubscription"
  ADD COLUMN "previousSecret" TEXT,
  ADD COLUMN "previousSecretExpiresAt" TIMESTAMP(3);
