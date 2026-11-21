/**
 * Shared types for the X (Twitter) integration module.
 */

/**
 * X account metrics fetched from the X API.
 */
export interface XAccountMetrics {
  handle: string;
  followers: number;
  engagement?: number;
  fetchedAt: Date;
}

/**
 * X account metrics response (normalized for API responses).
 */
export interface XAccountMetricsResponse {
  handle: string;
  followers: number;
  engagement: number | null;
  fetchedAt: string;
}

/**
 * X API user response structure.
 */
export interface XApiUserResponse {
  data: {
    id: string;
    name: string;
    username: string;
    public_metrics: {
      followers_count: number;
      following_count: number;
      tweet_count: number;
      listed_count: number;
    };
  };
}

/**
 * Options for fetching X metrics with fallback behavior.
 */
export interface FetchXMetricsOptions {
  /** Whether to use cached data when API is unavailable */
  useFallback?: boolean;
  /** Maximum age of cached data to use as fallback (in milliseconds) */
  maxCacheAge?: number;
}
