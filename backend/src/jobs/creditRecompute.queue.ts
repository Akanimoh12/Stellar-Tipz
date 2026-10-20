import { getQueue } from './queueFactory.js';

export const CREDIT_RECOMPUTE_QUEUE = 'credit-recompute';

/** Lazily-initialised singleton Queue for credit-score recompute jobs. */
export function getCreditRecomputeQueue() {
  return getQueue(CREDIT_RECOMPUTE_QUEUE);
}
