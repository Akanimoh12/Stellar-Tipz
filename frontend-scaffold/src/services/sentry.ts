import * as Sentry from "@sentry/react";
import { CaptureContext } from "@sentry/types";

const viteEnv = (import.meta as { env?: Record<string, string | undefined> }).env ?? {};

/**
 * PII patterns to scrub from error events.
 * - Stellar addresses: public keys starting with G, C, or S (56 chars)
 * - Contract IDs: start with C (56 chars)
 * - Email-like patterns
 * - Hex addresses or private keys (64+ hex chars)
 * - Phone numbers (simplified pattern)
 */
const PII_PATTERNS = [
  // Stellar addresses (format: 56-char base32)
  /\b[GCS][A-Z2-7]{54}\b/g,
  // Email addresses
  /\b[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}\b/g,
  // Hex addresses or private keys (64+ hex chars)
  /\b[0-9a-fA-F]{64,}\b/g,
  // Phone numbers: simple pattern (10+ consecutive digits with possible separators)
  /\b\d{3}[-.\s]?\d{3}[-.\s]?\d{4}\b/g,
];

/**
 * String scrubbing utility to redact PII from messages.
 */
function scrubbString(str: string | undefined | null): string | null {
  if (!str) return null;
  let result = String(str);
  PII_PATTERNS.forEach((pattern) => {
    result = result.replace(pattern, "[REDACTED]");
  });
  return result;
}

/**
 * Recursively scrub PII from an object (breadcrumbs, tags, context).
 */
function scrubbObject(obj: any): any {
  if (obj === null || obj === undefined) return obj;
  if (typeof obj === "string") return scrubbString(obj);
  if (typeof obj !== "object") return obj;

  if (Array.isArray(obj)) {
    return obj.map((item) => scrubbObject(item));
  }

  const scrubbed: any = {};
  for (const [key, value] of Object.entries(obj)) {
    // Skip sensitive keys entirely
    if (["password", "secret", "token", "apiKey", "privateKey"].includes(key.toLowerCase())) {
      scrubbed[key] = "[REDACTED]";
    } else {
      scrubbed[key] = scrubbObject(value);
    }
  }
  return scrubbed;
}

/**
 * Derive release version from build environment.
 * Combines app version from package.json with git commit SHA for uniqueness.
 */
function getRelease(): string {
  const version = "0.1.0"; // Derived from package.json
  const commit = viteEnv.VITE_GIT_COMMIT?.slice(0, 7) || "unknown";
  return `stellar-tipz@${version}+${commit}`;
}

export function initSentry(): void {
  const dsn = viteEnv.VITE_SENTRY_DSN;
  if (!dsn) return;

  Sentry.init({
    dsn,
    release: getRelease(),
    environment: viteEnv.VITE_NETWORK ?? "TESTNET",
    tracesSampleRate: 0.1,
    // Reduce sampling for performance transactions in production
    profilesSampleRate: 0.1,
    integrations: [
      Sentry.browserTracingIntegration({
        // Track React Router navigation
        routingInstrumentation: Sentry.reactRouterV7Instrumentation(
          window.history,
        ),
      }),
    ],
    // Scrub PII before sending events
    beforeSend: (event, hint) => {
      if (event.breadcrumbs) {
        event.breadcrumbs = event.breadcrumbs.map((crumb) => ({
          ...crumb,
          message: scrubbString(crumb.message),
          data: crumb.data ? scrubbObject(crumb.data) : undefined,
        }));
      }

      if (event.request) {
        event.request = scrubbObject(event.request);
      }

      if (event.tags) {
        event.tags = scrubbObject(event.tags) as Record<string, string>;
      }

      if (event.contexts) {
        event.contexts = scrubbObject(event.contexts);
      }

      if (event.extra) {
        event.extra = scrubbObject(event.extra);
      }

      // Scrub exception message and values
      if (event.exception?.values) {
        event.exception.values = event.exception.values.map((exc) => ({
          ...exc,
          value: scrubbString(exc.value),
          stacktrace: exc.stacktrace
            ? {
                ...exc.stacktrace,
                frames: exc.stacktrace.frames?.map((frame) => ({
                  ...frame,
                  vars: frame.vars ? scrubbObject(frame.vars) : undefined,
                })),
              }
            : undefined,
        }));
      }

      return event;
    },
    // Attach source maps to track errors back to original code
    attachStacktrace: true,
    autoSessionTracking: true,
  });
}

export function captureError(error: Error, context?: CaptureContext): void {
  Sentry.captureException(error, context);
}

export function setUser(walletAddress: string | null): void {
  Sentry.setUser(walletAddress ? { id: walletAddress } : null);
}

/**
 * Set correlation context for frontend-to-backend request tracing.
 * Call this after receiving a response from the backend that contains x-request-id.
 */
export function setRequestId(requestId: string | null): void {
  if (requestId) {
    Sentry.setContext("request", { id: requestId });
    Sentry.setTag("request_id", requestId);
  }
}

/**
 * Add a breadcrumb for tracking user interactions and events.
 * Automatically scrubs PII from the message and data.
 */
export function addBreadcrumb(
  message: string,
  data?: Record<string, any>,
  category?: string,
  level?: "fatal" | "error" | "warning" | "info" | "debug",
): void {
  Sentry.captureMessage(message, {
    level: level ?? "info",
    tags: {
      category: category || "app",
    },
    extra: data,
  });
}
