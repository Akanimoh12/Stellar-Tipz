import { getQueue } from './queueFactory.js';

export const ANALYTICS_DAILY_QUEUE = 'analytics-daily';

/** Lazily-initialised singleton Queue for daily analytics rollup jobs. */
export function getAnalyticsDailyQueue() {
  return getQueue(ANALYTICS_DAILY_QUEUE);
}
