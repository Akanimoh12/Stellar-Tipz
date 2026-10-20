import type { SnapshotPeriod, TimeWindow } from './leaderboard.schema.js';

export interface LeaderboardEntry {
  rank: number;
  userId: string;
  username: string | null;
  stellarAddress: string;
  totalTips: string;
}

export interface LeaderboardPagination {
  limit: number;
  /** Rank offset of the first entry on this page (also set when paging by cursor). */
  offset: number;
  total: number;
  hasMore: boolean;
  /** Opaque cursor for the next page, or null on the last page. */
  nextCursor: string | null;
}

export interface LeaderboardResponse {
  data: LeaderboardEntry[];
  window: TimeWindow;
  pagination: LeaderboardPagination;
}

export interface LeaderboardSnapshotResult {
  period: SnapshotPeriod;
  entriesCreated: number;
}
