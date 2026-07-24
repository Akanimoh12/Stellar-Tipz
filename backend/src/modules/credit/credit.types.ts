export interface CreditScoreResponse {
  userId: string;
  score: number;
  tier: string;
  components: CreditScoreComponents;
  computedAt: string;
}

export interface CreditScoreComponents {
  base: number;
  tipVolume: number;
  xMetrics: number;
  accountAge: number;
  streakBonus: number;
}

export interface ComputeCreditScoreInput {
  totalTipsReceived: bigint;
  xFollowers: number;
  xEngagementAvg: number;
  accountAgeDays: number;
  streakBonus: number;
}

export interface CreditScoreHistoryPoint {
  value: number;
  computedAt: string;
}
