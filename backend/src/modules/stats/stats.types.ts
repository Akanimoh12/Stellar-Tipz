export interface Activity24h {
  tips: number | null;
  volumeStroops: string | null;
}

export interface PlatformStatsResponse {
  /** Total confirmed tips across the platform. Null when the source is unavailable. */
  totalTips: number | null;
  /** Total confirmed tip volume (stroops). Null when the source is unavailable. */
  totalVolumeStroops: string | null;
  /** Count of active creators (with ≥1 confirmed tip, not excluded). Null if unavailable. */
  creatorCount: number | null;
  activity24h: Activity24h;
  /** ISO timestamp of when these stats were computed. */
  generatedAt: string;
  /**
   * True when the response is a placeholder because the underlying data source
   * could not be read. In that case numeric fields are null rather than guessed.
   */
  stale: boolean;
}
