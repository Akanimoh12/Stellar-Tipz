import { getQueue } from './queueFactory.js';

export const LEADERBOARD_SNAPSHOT_QUEUE = 'leaderboard-snapshot';

/** Lazily-initialised singleton Queue for leaderboard snapshot jobs. */
export function getLeaderboardSnapshotQueue() {
  return getQueue(LEADERBOARD_SNAPSHOT_QUEUE);
}
