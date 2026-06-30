/**
 * Executes a function with exponential backoff retry logic.
 * Used for transient RPC errors that may occur during indexing.
 */
export interface RetryOptions {
  maxAttempts?: number;
  initialDelayMs?: number;
  maxDelayMs?: number;
  factor?: number;
}

/** Returns true for transient errors that should be retried. */
function isTransientError(error: unknown): boolean {
  if (error instanceof Error) {
    const message = error.message.toLowerCase();
    return (
      message.includes('timeout') ||
      message.includes('network') ||
      message.includes('connection') ||
      message.includes('rate limit') ||
      message.includes('too many requests') ||
      message.includes('service unavailable') ||
      message.includes('internal server error') ||
      'status' in error && [429, 502, 503, 504].includes(Number((error as { status?: number }).status))
    );
  }
  return false;
}

/**
 * Executes a function with exponential backoff retry logic.
 * Retries on transient errors (network timeouts, rate limits, 5xx status codes).
 */
export async function withRetry<T>(fn: () => Promise<T>, options: RetryOptions = {}): Promise<T> {
  const {
    maxAttempts = 5,
    initialDelayMs = 100,
    maxDelayMs = 5000,
    factor = 2,
  } = options;

  let attempt = 0;

  while (true) {
    try {
      return await fn();
    } catch (error) {
      attempt++;
      if (attempt >= maxAttempts || !isTransientError(error)) {
        throw error;
      }
      const delay = Math.min(initialDelayMs * factor ** (attempt - 1), maxDelayMs);
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }
}