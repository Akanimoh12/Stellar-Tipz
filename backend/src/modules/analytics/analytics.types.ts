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
