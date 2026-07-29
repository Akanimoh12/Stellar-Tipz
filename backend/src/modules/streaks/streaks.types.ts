/** Serialized tipping streak returned by the streaks API. */
export interface StreakResponse {
  currentStreak: number;
  longestStreak: number;
  lastTipDate: string | null;
}
