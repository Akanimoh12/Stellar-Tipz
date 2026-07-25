export interface XMetricsResponse {
  handle: string;
  followers: number;
  engagement: number | null;
  fetchedAt: string;
}

export interface RefreshMetricsSummary {
  total: number;
  succeeded: number;
  failed: number;
}
