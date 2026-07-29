export interface StreakResponse {
  id: string;
  userId: string;
  currentStreak: number;
  longestStreak: number;
  lastTipDate: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface StreakUpdateResult {
  currentStreak: number;
  longestStreak: number;
  streakUpdated: boolean;
}
