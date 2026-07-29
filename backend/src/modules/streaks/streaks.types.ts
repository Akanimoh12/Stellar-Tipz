export interface StreakResponse {
  currentStreak: number;
  longestStreak: number;
  lastTipDate: string | null;
}

export interface StreakUpdateResult {
  currentStreak: number;
  longestStreak: number;
  streakUpdated: boolean;
}
