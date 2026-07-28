import { getQueue } from './queueFactory.js';

export const SUBSCRIPTION_CHARGE_QUEUE = 'subscription-charge';

/** Lazily-initialised singleton Queue for subscription-charge processing jobs. */
export function getSubscriptionChargeQueue() {
  return getQueue(SUBSCRIPTION_CHARGE_QUEUE);
}
