import { logger } from "./logger.js";

/**
 * Timeout-aware fetch wrapper (issue #090).
 * - Merges an explicit timeout (AbortSignal.timeout) with an optional parent AbortSignal (client disconnect).
 * - Throws a TimeoutError-named DOMException on timeout so callers can distinguish upstream timeout from cancellation.
 */

export interface FetchWithTimeoutOptions extends RequestInit {
  timeoutMs?: number;
  /** Parent signal (e.g. from Express req.signal) — aborting this aborts the fetch. */
  parentSignal?: AbortSignal;
}

/**
 * Performs a fetch with an explicit timeout and optional parent signal.
 * Uses AbortSignal.any when available to combine signals, otherwise manual AbortController.
 */
export async function fetchWithTimeout(
  url: string,
  options: FetchWithTimeoutOptions = {},
): Promise<Response> {
  const { timeoutMs, parentSignal, signal: explicitSignal, ...rest } = options;

  // Build timeout signal if requested
  const timeoutSignal = timeoutMs ? AbortSignal.timeout(timeoutMs) : undefined;

  // Merge signals: parentSignal + timeoutSignal + explicitSignal
  let combinedSignal: AbortSignal | undefined;
  const signals: AbortSignal[] = [];
  if (parentSignal) signals.push(parentSignal);
  if (timeoutSignal) signals.push(timeoutSignal);
  if (explicitSignal) signals.push(explicitSignal as AbortSignal);

  if (signals.length === 0) {
    combinedSignal = undefined;
  } else if (signals.length === 1) {
    combinedSignal = signals[0];
  } else {
    // Node 20+ supports AbortSignal.any; fallback to manual controller
    const anyFn = (AbortSignal as unknown as { any?: (s: AbortSignal[]) => AbortSignal }).any;
    if (typeof anyFn === "function") {
      combinedSignal = anyFn.call(AbortSignal, signals);
    } else {
      const controller = new AbortController();
      const onAbort = () => controller.abort((signals.find((s) => s.aborted)?.reason as Error) ?? new DOMException("Aborted", "AbortError"));
      for (const s of signals) {
        if (s.aborted) {
          onAbort();
          break;
        }
        s.addEventListener("abort", onAbort, { once: true });
      }
      combinedSignal = controller.signal;
    }
  }

  try {
    return await fetch(url, { ...rest, signal: combinedSignal });
  } catch (err) {
    // Normalise timeout vs cancellation for logging
    if (err instanceof DOMException) {
      if (err.name === "TimeoutError") {
        logger.warn({ url, timeoutMs }, "Upstream request timed out");
        // Preserve TimeoutError name so retry logic can treat it as transient
        throw err;
      }
      if (err.name === "AbortError") {
        // Could be client disconnect — check parentSignal
        if (parentSignal?.aborted) {
          logger.debug({ url }, "Upstream request aborted due to client disconnect");
        }
        throw err;
      }
    }
    throw err;
  }
}

/**
 * Wraps any promise with a timeout. Used for Soroban RPC calls that don't go through fetch directly.
 */
export async function withTimeout<T>(promise: Promise<T>, timeoutMs: number, operation = "operation"): Promise<T> {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => {
      const err = new DOMException(`${operation} timed out after ${timeoutMs}ms`, "TimeoutError");
      reject(err);
    }, timeoutMs);
  });
  try {
    const result = await Promise.race([promise, timeoutPromise]);
    return result as T;
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }
}

/**
 * Wraps a promise with both timeout and parent signal cancellation.
 */
export async function withTimeoutAndSignal<T>(
  promise: Promise<T>,
  timeoutMs: number,
  parentSignal?: AbortSignal,
  operation = "operation",
): Promise<T> {
  if (parentSignal?.aborted) {
    throw new DOMException("Aborted due to client disconnect", "AbortError");
  }
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  let onAbort: (() => void) | undefined;

  const abortPromise = parentSignal
    ? new Promise<never>((_, reject) => {
        onAbort = () => reject(new DOMException("Aborted due to client disconnect", "AbortError"));
        parentSignal.addEventListener("abort", onAbort, { once: true });
      })
    : null;

  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => {
      const err = new DOMException(`${operation} timed out after ${timeoutMs}ms`, "TimeoutError");
      reject(err);
    }, timeoutMs);
  });

  const race: Promise<T>[] = [promise as Promise<T>];
  // Trick: push timeout and abort as Promise<T> via type coercion
  (race as unknown as Promise<unknown>[]).push(timeoutPromise as unknown as Promise<T>);
  if (abortPromise) (race as unknown as Promise<unknown>[]).push(abortPromise as unknown as Promise<T>);

  try {
    return await Promise.race(race);
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
    if (parentSignal && onAbort) parentSignal.removeEventListener("abort", onAbort);
  }
}
