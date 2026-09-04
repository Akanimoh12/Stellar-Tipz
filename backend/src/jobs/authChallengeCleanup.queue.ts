import { getQueue } from './queueFactory.js';

export const AUTH_CHALLENGE_CLEANUP_QUEUE = 'auth-challenge-cleanup';

/** Lazily-initialised singleton Queue for auth challenge cleanup jobs. */
export function getAuthChallengeCleanupQueue() {
  return getQueue(AUTH_CHALLENGE_CLEANUP_QUEUE);
}
