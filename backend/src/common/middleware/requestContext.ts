import { AsyncLocalStorage } from 'node:async_hooks';

/** Per-request context made available to code running inside a request. */
export interface RequestContext {
  requestId: string;
}

const requestContextStorage = new AsyncLocalStorage<RequestContext>();

/**
 * Run `fn` with `requestId` available via {@link getRequestId}.
 *
 * This is what lets the slow-query middleware correlate a slow database query
 * back to the HTTP request that triggered it, even though Prisma runs far
 * from the Express handler (issue #095).
 */
export function runWithRequestContext<T>(requestId: string, fn: () => T): T {
  return requestContextStorage.run({ requestId }, fn);
}

/** Returns the active request id, or `undefined` outside a request context. */
export function getRequestId(): string | undefined {
  return requestContextStorage.getStore()?.requestId;
}
