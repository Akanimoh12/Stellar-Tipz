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
  offset: number;
  total: number;
  hasMore: boolean;
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
