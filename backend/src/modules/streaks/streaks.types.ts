/**
 * Streak module types.
 *
 * Establishes contract as authoritative source of truth.
 * Off-chain service reads projections populated by indexer.
 *
 * Issue #1270
 */

export interface StreakData {
  userId: string;
  currentStreak: number;
  longestStreak: number;
  lastTipDate: Date | null;
  source: "contract" | "projection";
  freshness: string; // ISO timestamp of when data was last updated
}

export interface StreakResponse {
  userId: string;
  currentStreak: number;
  longestStreak: number;
  lastTipDate: string | null;
  source: "contract" | "projection";
  freshness: string;
}
