/**
 * Leaderboard service consistency documentation.
 *
 * This file documents which data source the API serves and why.
 * 
 * Issue #1268
 */

/**
 * LEADERBOARD DATA SOURCES
 * =========================
 * 
 * Authoritative Source: On-chain contract
 * -----------------------------------------
 * The on-chain leaderboard maintained in `contracts/tipz/src/leaderboard.rs` is the
 * authoritative source of truth. It is updated in real-time with every tip transaction.
 * 
 * Off-chain Cache: LeaderboardSnapshot table
 * --------------------------------------------
 * The off-chain `LeaderboardSnapshot` table in the database is a performance cache that
 * is periodically refreshed by a background worker. It provides fast reads for paginated
 * leaderboard queries without hitting the RPC for every request.
 * 
 * API Serving Strategy
 * --------------------
 * - WEEKLY and MONTHLY periods: Served from off-chain snapshots for performance
 * - ALL_TIME period: Served from live aggregation when snapshots are not available
 * - The API response includes metadata about the data source and freshness
 * 
 * Consistency Verification
 * -------------------------
 * A background job (`leaderboardSnapshot.worker.ts`) runs periodically to compare
 * off-chain snapshots against on-chain state. Divergences beyond tolerance are logged
 * and alerted. On-chain always wins in case of conflict.
 * 
 * Trade-offs
 * ----------
 * - Off-chain snapshots provide fast reads but may be slightly stale
 * - The consistency job bounds the staleness and detects divergence
 * - On-chain is the single source of truth for ranking calculations
 * 
 * Configuration
 * --------------
 * - Snapshot refresh interval: Configured via worker schedule
 * - Consistency check interval: Configured via verification worker schedule
 * - Tolerance thresholds: Configured in leaderboardSnapshot.worker.ts
 */

export const LEADERBOARD_DATA_SOURCE_DOCUMENTATION = {
  authoritative: "on-chain contract",
  cache: "off-chain LeaderboardSnapshot table",
  servingStrategy: {
    weekly: "off-chain snapshot",
    monthly: "off-chain snapshot",
    allTime: "live aggregation",
  },
  consistency: "periodic verification job compares on-chain vs off-chain",
  conflictResolution: "on-chain wins",
} as const;
