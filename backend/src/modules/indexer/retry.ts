/**
 * #1262 — Indexer retry utility with exponential backoff and error classification.
 */

export interface RetryOptions {
  maxAttempts?: number;
  initialDelayMs?: number;
  backoffFactor?: number;
  maxDelayMs?: number;
  shouldRetry?: (error: unknown, attempt: number) => boolean;
}

export const DEFAULT_RETRY_OPTIONS: Required<RetryOptions> = {
  maxAttempts: 3,
  initialDelayMs: 100,
  backoffFactor: 2,
  maxDelayMs: 2000,
  shouldRetry: () => true,
};

/**
 * Executes an operation with configurable retries.
 * Throws the final error if all attempts fail.
 */
export async function withRetry<T>(
  operation: (attempt: number) => Promise<T>,
  options: RetryOptions = {},
): Promise<T> {
  const opts = { ...DEFAULT_RETRY_OPTIONS, ...options };
  let lastError: unknown;

  for (let attempt = 1; attempt <= opts.maxAttempts; attempt++) {
    try {
      return await operation(attempt);
    } catch (err) {
      lastError = err;

      if (attempt >= opts.maxAttempts || !opts.shouldRetry(err, attempt)) {
        throw err;
      }

      const delay = Math.min(
        opts.initialDelayMs * Math.pow(opts.backoffFactor, attempt - 1),
        opts.maxDelayMs,
      );

      await new Promise((resolve) => globalThis.setTimeout(resolve, delay));
    }
  }

  throw lastError;
}
