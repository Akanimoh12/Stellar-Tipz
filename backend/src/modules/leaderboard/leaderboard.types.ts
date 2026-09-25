/**
 * Shared types for the leaderboard module.
 * Issue #933 – Leaderboard: Leaderboard by credit score variant.
 */

export type LeaderboardVariant = "tips" | "credit";
export type LeaderboardPeriod = "WEEKLY" | "MONTHLY" | "ALL_TIME";

/** A single entry in the leaderboard. */
export interface LeaderboardEntry {
  rank: number;
  userId: string;
  stellarAddress: string;
  username: string | null;
  displayName: string | null;
  /** Total tips received (stroops) – used for tips variant. */
  totalTipsStroops?: string;
  /** Credit score [0-100] – used for credit variant. */
  creditScore?: number;
}

/** Paginated leaderboard response. */
export interface LeaderboardResponse {
  variant: LeaderboardVariant;
  period: LeaderboardPeriod;
  entries: LeaderboardEntry[];
  total: number;
  page: number;
  limit: number;
  /** Data source: "on-chain" or "off-chain-snapshot" */
  dataSource: "on-chain" | "off-chain-snapshot";
  /** ISO timestamp of when data was last refreshed */
  freshness: string;
}
