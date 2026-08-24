import { getQueue } from './queueFactory.js';

export const X_METRICS_REFRESH_QUEUE = 'x-metrics-refresh';

/** Lazily-initialised singleton Queue for X metrics refresh jobs. */
export function getXMetricsRefreshQueue() {
  return getQueue(X_METRICS_REFRESH_QUEUE);
}
