import { getQueue } from './queueFactory.js';

export const DISCOVERY_QUEUE = 'discovery';

export function getDiscoveryQueue() {
  return getQueue(DISCOVERY_QUEUE);
}
