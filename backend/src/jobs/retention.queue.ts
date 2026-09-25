import { getQueue } from './queueFactory.js';

export const RETENTION_QUEUE = 'retention';

export function getRetentionQueue() {
  return getQueue(RETENTION_QUEUE);
}