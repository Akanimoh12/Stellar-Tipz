/**
 * Re-export shared retry utility — standardised behaviour (issue #092).
 * Keeps this file as the import surface for the indexer so existing imports keep working.
 * The shared implementation lives in src/common/utils/retry.ts with full jitter,
 * proper 4xx isolation and method/idempotency awareness.
 *
 * Backward-compat: default maxAttempts stays 5 (original indexer default) when
 * caller omits options, matching existing tests. New callers should import from
 * 'common/utils/retry.js' and rely on env-configured defaults (RETRY_MAX_ATTEMPTS=3).
 */
export type { RetryOptions } from "../common/utils/retry.js";
export { isTransientError } from "../common/utils/retry.js";
import { withRetry as sharedRetry } from "../common/utils/retry.js";
import type { RetryOptions } from "../common/utils/retry.js";

export async function withRetry<T>(fn: () => Promise<T>, options: RetryOptions = {}): Promise<T> {
  // Preserve indexer legacy default (5) when maxAttempts unspecified; shared default is env-driven (3)
  const opts: RetryOptions = { maxAttempts: 5, ...options };
  // For indexer internal retries, disable jitter by default to keep existing timer tests deterministic
  // (callers can explicitly enable jitter via { jitter: true })
  if (opts.jitter === undefined) opts.jitter = false;
  return sharedRetry(fn, opts);
}