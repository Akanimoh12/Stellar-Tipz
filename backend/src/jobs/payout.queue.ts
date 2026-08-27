import { getQueue } from './queueFactory.js';

export const PAYOUT_QUEUE = 'payout';

export function getPayoutQueue() {
  return getQueue(PAYOUT_QUEUE);
}
