import { getQueue } from './queueFactory.js';

export const PLATFORM_STATS_QUEUE = 'platform-stats';

export function getPlatformStatsQueue() {
  return getQueue(PLATFORM_STATS_QUEUE);
}
