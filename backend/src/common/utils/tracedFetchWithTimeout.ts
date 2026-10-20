import { tracedFetch, type TracedFetchOptions } from '../observability/httpTracing.js';

/**
 * Traced version of fetchWithTimeout that combines OpenTelemetry tracing
 * with timeout and signal handling.
 */
export interface TracedFetchWithTimeoutOptions extends TracedFetchOptions {
  timeoutMs?: number;
  parentSignal?: AbortSignal;
}

/**
 * Performs a fetch with timeout, parent signal, and OpenTelemetry tracing.
 */
export async function tracedFetchWithTimeout(
  url: string,
  options: TracedFetchWithTimeoutOptions = {},
): Promise<Response> {
  const { timeoutMs, parentSignal, operationName, serviceName, recordBody, ...fetchOptions } = options;

  // Build timeout signal if requested
  const timeoutSignal = timeoutMs ? AbortSignal.timeout(timeoutMs) : undefined;

  // Merge signals: parentSignal + timeoutSignal + explicitSignal
  let combinedSignal: AbortSignal | undefined;
  const signals: AbortSignal[] = [];
  if (parentSignal) signals.push(parentSignal);
  if (timeoutSignal) signals.push(timeoutSignal);
  const explicitSignal = fetchOptions.signal;
  if (explicitSignal) signals.push(explicitSignal as AbortSignal);

  if (signals.length === 0) {
    combinedSignal = undefined;
  } else if (signals.length === 1) {
    combinedSignal = signals[0];
  } else {
    const anyFn = (AbortSignal as unknown as { any?: (s: AbortSignal[]) => AbortSignal }).any;
    if (typeof anyFn === 'function') {
      combinedSignal = anyFn.call(AbortSignal, signals);
    } else {
      const controller = new AbortController();
      const onAbort = () => controller.abort((signals.find((s) => s.aborted)?.reason as Error) ?? new DOMException('Aborted', 'AbortError'));
      for (const s of signals) {
        if (s.aborted) {
          onAbort();
          break;
        }
        s.addEventListener('abort', onAbort, { once: true });
      }
      combinedSignal = controller.signal;
    }
  }

  return tracedFetch(url, {
    ...fetchOptions,
    signal: combinedSignal,
    operationName,
    serviceName,
    recordBody,
  });
}