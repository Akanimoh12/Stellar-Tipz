export interface LeaderboardEntry {
  rank: number;
  userId: string;
  username: string | null;
  stellarAddress: string;
  totalTips: string;
}

export interface LeaderboardResponse {
  data: LeaderboardEntry[];
  period: string;
}
