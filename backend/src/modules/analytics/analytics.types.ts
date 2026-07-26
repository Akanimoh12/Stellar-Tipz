/** A single daily analytics entry. */
export interface AnalyticsDailyEntry {
  date: string;
  totalTips: number;
  totalVolume: string;
  newUsers: number;
  activeUsers: number;
}

/** Paginated daily analytics response. */
export interface AnalyticsDailyResponse {
  data: AnalyticsDailyEntry[];
  pagination: {
    limit: number;
    offset: number;
    total: number;
    hasMore: boolean;
  };
}

/** Platform summary aggregating daily stats into a single overview. */
export interface AnalyticsSummary {
  totalTips: number;
  totalVolume: string;
  totalNewUsers: number;
  totalActiveUsers: number;
  period: {
    start: string | null;
    end: string | null;
  };
}

/** Tip volume time-series entry (issue #1008). */
export interface TipVolumeEntry {
  date: string;
  totalTips: string;
  count: number;
}

/** Tip volume time-series response (issue #1008). */
export interface TipVolumeResponse {
  entries: TipVolumeEntry[];
  granularity: string;
  startDate: string;
  endDate: string;
}

/** Top tipper entry (issue #1009). */
export interface TopTipperEntry {
  userId: string;
  stellarAddress: string;
  username: string | null;
  displayName: string | null;
  totalTipsStroops: string;
  tipCount: number;
}

/** Top tippers response (issue #1009). */
export interface TopTippersResponse {
  entries: TopTipperEntry[];
  total: number;
  page: number;
  limit: number;
}

/** Active users time-series entry (issue #1010). */
export interface ActiveUsersEntry {
  date: string;
  activeUsers: number;
}

/** Active users time-series response (issue #1010). */
export interface ActiveUsersResponse {
  entries: ActiveUsersEntry[];
  granularity: string;
  startDate: string;
  endDate: string;
}
