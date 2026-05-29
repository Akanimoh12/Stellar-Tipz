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

export function captureError(error: Error): void {
  Sentry.captureException(error);
}

export function setUser(walletAddress: string | null): void {
  Sentry.setUser(walletAddress ? { id: walletAddress } : null);
}
