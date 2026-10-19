import { logger } from "./logger.js";
import { config } from "../../config/index.js";

/**
 * Shared retry utility with exponential backoff and full jitter (issues #092, #090).
 * - Only idempotent/transient failures retry — never a 4xx (except 429/408), never a non-idempotent write without idempotency key.
 * - Max attempts and ceiling are configurable via env or per-call options.
 * - Retry attempts are logged with reason.
 */

export interface RetryOptions {
  maxAttempts?: number;
  initialDelayMs?: number;
  maxDelayMs?: number;
  factor?: number;
  jitter?: boolean;
  /** HTTP method for idempotency check — when set, non-idempotent writes (POST/PATCH) only retry if idempotencyKey is present. */
  method?: string;
  /** If present, POST/PATCH are considered safe to retry (compose with #075). */
  idempotencyKey?: string;
  /** Override transient check */
  isRetryable?: (error: unknown) => boolean;
  /** AbortSignal to support cancellation (issue #090) */
  signal?: AbortSignal;
}

const IDEMPOTENT_METHODS = new Set(["GET", "HEAD", "PUT", "DELETE", "OPTIONS", "TRACE"]);

/**
 * Determines if an error is transient and should be retried.
 * - Network/timeout/connection errors, 429, 502, 503, 504, 408.
 * - Never retry 4xx client errors except 429/408.
 */
export function isTransientError(error: unknown): boolean {
  if (error instanceof DOMException) {
    if (error.name === "TimeoutError") return true;
    if (error.name === "AbortError") return false;
  }
  if (error instanceof Error) {
    // Check for AbortError with message timeout
    if (error.name === "AbortError" || error.name === "TimeoutError") return true;
    const message = error.message.toLowerCase();
    if (
      message.includes("timeout") ||
      message.includes("timed out") ||
      message.includes("network") ||
      message.includes("connection") ||
      message.includes("econnrefused") ||
      message.includes("econnreset") ||
      message.includes("socket hang up")
    ) {
      return true;
    }
    // Status-based check — look for .status, .statusCode, .code
    const maybe = error as unknown as { status?: number; statusCode?: number; code?: string | number };
    const status = maybe.status ?? maybe.statusCode ?? (typeof maybe.code === "number" ? maybe.code : undefined);
    if (status !== undefined) {
      const code = Number(status);
      if (code === 429 || code === 408 || code === 502 || code === 503 || code === 504) return true;
      if (code >= 400 && code < 500) return false;
      if (code >= 500) return true;
    }
    // Message heuristics for status text
    if (
      message.includes("rate limit") ||
      message.includes("too many requests") ||
      message.includes("service unavailable") ||
      message.includes("bad gateway") ||
      message.includes("gateway timeout") ||
      message.includes("internal server error")
    ) {
      return true;
    }
  }
  return false;
}

function isIdempotent(method: string | undefined, idempotencyKey: string | undefined): boolean {
  if (!method) return true; // if no method context, assume safe (indexer retries are safe)
  const upper = method.toUpperCase();
  if (IDEMPOTENT_METHODS.has(upper)) return true;
  // POST/PATCH with idempotency key are safe (issue #075)
  if (idempotencyKey && idempotencyKey.trim().length > 0) return true;
  return false;
}

function computeDelay(attempt: number, initialDelayMs: number, maxDelayMs: number, factor: number, jitter: boolean): number {
  const exponential = Math.min(initialDelayMs * Math.pow(factor, attempt - 1), maxDelayMs);
  if (jitter) {
    // Full jitter: random [0, exponential]
    return Math.random() * exponential;
  }
  return exponential;
}

export async function withRetry<T>(fn: () => Promise<T>, options: RetryOptions = {}): Promise<T> {
  const {
    maxAttempts = (config as unknown as { retry?: { maxAttempts: number } })?.retry?.maxAttempts ?? 3,
    initialDelayMs = (config as unknown as { retry?: { initialDelayMs: number } })?.retry?.initialDelayMs ?? 100,
    maxDelayMs = (config as unknown as { retry?: { maxDelayMs: number } })?.retry?.maxDelayMs ?? 5000,
    factor = (config as unknown as { retry?: { factor: number } })?.retry?.factor ?? 2,
    jitter = true,
    method,
    idempotencyKey,
    isRetryable = isTransientError,
    signal,
  } = options;

  let attempt = 0;

  while (true) {
    if (signal?.aborted) {
      throw new DOMException("Retry aborted", "AbortError");
    }
    try {
      return await fn();
    } catch (error) {
      attempt++;

      // Never retry if not idempotent
      if (!isIdempotent(method, idempotencyKey)) {
        logger.debug({ attempt, method, reason: "non-idempotent" }, "Not retrying non-idempotent operation");
        throw error;
      }

      // Never retry if not transient
      if (!isRetryable(error)) {
        logger.debug({ attempt, error: (error as Error)?.message, reason: "non-retryable" }, "Not retrying non-retryable error");
        throw error;
      }

      if (attempt >= maxAttempts) {
        logger.warn({ attempt, maxAttempts, error: (error as Error)?.message }, "Retry exhausted");
        throw error;
      }

      const delay = computeDelay(attempt, initialDelayMs, maxDelayMs, factor, jitter);
      const errMsg = error instanceof Error ? error.message : String(error);
      logger.warn(
        { attempt, maxAttempts, delay: Math.round(delay), error: errMsg },
        `Retrying after transient error (attempt ${attempt}/${maxAttempts})`,
      );

      // Support cancellation while waiting
      if (signal) {
        await new Promise<void>((resolve, reject) => {
          const timeout = setTimeout(resolve, delay);
          const onAbort = () => {
            clearTimeout(timeout);
            reject(new DOMException("Retry aborted", "AbortError"));
          };
          signal.addEventListener("abort", onAbort, { once: true });
          // also handle timeout cleanup
          setTimeout(() => signal.removeEventListener("abort", onAbort), delay + 10);
        });
        if (signal.aborted) throw new DOMException("Retry aborted", "AbortError");
      } else {
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
  }
}

/** Legacy export alias for indexer compatibility */
export const retry = withRetry;
