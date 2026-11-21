/**
 * Public entry point of the analytics module. The implementation is split by
 * concern (issue #1627):
 *
 * - `analytics.query.ts`        read endpoints (daily, summary, volume, top
 *                               tippers, active users, creator analytics)
 * - `analytics.queryHelpers.ts` bucketing, range and profile helpers for the queries
 * - `analytics.rollup.ts`       jobs that precompute AnalyticsDaily and TipperRollup
 *
 * Callers (controller, jobs, tests) keep importing from this file.
 */
export {
  getActiveUsers,
  getAnalyticsSummary,
  getCreatorAnalytics,
  getDailyAnalytics,
  getTipVolume,
  getTopTippers,
} from './analytics.query.js';
export { computeDailyAnalytics, refreshTipperRollup } from './analytics.rollup.js';
