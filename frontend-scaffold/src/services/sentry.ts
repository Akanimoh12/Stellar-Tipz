import * as Sentry from "@sentry/react";

const viteEnv = (import.meta as { env?: Record<string, string | undefined> }).env ?? {};

export function initSentry(): void {
  const dsn = viteEnv.VITE_SENTRY_DSN;
  if (!dsn) return;

  Sentry.init({
    dsn,
    environment: viteEnv.VITE_NETWORK ?? "TESTNET",
    tracesSampleRate: 0.1,
    integrations: [Sentry.browserTracingIntegration()],
  });
}

export function captureError(
  error: Error,
  context?: Record<string, unknown>,
): void {
  if (!context) {
    Sentry.captureException(error);
    return;
  }

  const tags: Record<string, string> = {};
  if (typeof context.boundary === "string") tags.boundary = context.boundary;
  if (typeof context.feature === "string") tags.feature = context.feature;

  Sentry.captureException(error, {
    tags: Object.keys(tags).length > 0 ? tags : undefined,
    extra: context,
  });
}

export function setUser(walletAddress: string | null): void {
  Sentry.setUser(walletAddress ? { id: walletAddress } : null);
}
