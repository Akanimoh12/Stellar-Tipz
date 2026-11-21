import { z } from 'zod';
import { booleanString } from './common.schema.js';
import { MAX_STROOP_AMOUNT } from '../../common/validation/stroops.js';

export const servicesEnvSchema = z.object({
  /** Attaches the Socket.IO Redis adapter so realtime rooms are shared across horizontally scaled instances. */
  REALTIME_REDIS_ADAPTER_ENABLED: booleanString,
  EMAIL_WEBHOOK_URL: z.string().url().optional(),
  NOTIFICATION_RECEIPT_SECRET: z.string().min(32).optional(),
  REALTIME_CATCHUP_LIMIT: z.coerce.number().int().min(1).max(1000).default(100),
  REALTIME_CATCHUP_TTL_SECONDS: z.coerce.number().int().min(1).max(86400).default(3600),

  /** Cron expression for the bounded data-retention pruning job. */
  RETENTION_PRUNE_CRON: z.string().default('0 3 * * *'),
  /** Maximum rows processed by one retention batch. */
  RETENTION_BATCH_SIZE: z.coerce.number().int().positive().max(5000).default(500),

  CREDIT_RECOMPUTE_CRON: z.string().default('0 */6 * * *'),
  /** Cron expression for the daily analytics rollup job. Runs at 00:05 UTC daily by default. */
  ANALYTICS_DAILY_CRON: z.string().default('5 0 * * *'),
  /** Cron expression for rebuilding the ranked top-tippers rollup (issue #1265). */
  ANALYTICS_TIPPER_ROLLUP_CRON: z.string().default('*/10 * * * *'),
  /** Cron expression for the leaderboard snapshot job. Runs at 00:15 UTC daily by default. */
  LEADERBOARD_SNAPSHOT_CRON: z.string().default('15 0 * * *'),
  /** Cron expression for the X metrics refresh job. Runs at 00:30 UTC daily by default. */
  X_METRICS_REFRESH_CRON: z.string().default('30 0 * * *'),

  /** Credit score weights (must sum to <= 100) */
  CREDIT_SCORE_WEIGHT_BASE: z.coerce.number().int().min(0).max(100).optional(),
  CREDIT_SCORE_WEIGHT_TIP: z.coerce.number().int().min(0).max(100).optional(),
  CREDIT_SCORE_WEIGHT_X: z.coerce.number().int().min(0).max(100).optional(),
  CREDIT_SCORE_WEIGHT_AGE: z.coerce.number().int().min(0).max(100).optional(),
  /** Credit score divisors */
  CREDIT_SCORE_DIVISOR_TIP: z.coerce.number().int().positive().optional(),
  CREDIT_SCORE_DIVISOR_FOLLOWER: z.coerce.number().int().positive().optional(),
  CREDIT_SCORE_DIVISOR_ENGAGEMENT: z.coerce.number().int().positive().optional(),
  CREDIT_SCORE_DIVISOR_AGE: z.coerce.number().int().positive().optional(),
  /** Credit score caps */
  CREDIT_SCORE_CAP_BASE: z.coerce.number().int().min(0).optional(),
  CREDIT_SCORE_CAP_MAX: z.coerce.number().int().min(0).optional(),
  CREDIT_SCORE_CAP_X_SUB: z.coerce.number().int().min(0).optional(),
  CREDIT_SCORE_CAP_AGE_SUB: z.coerce.number().int().min(0).optional(),
  CREDIT_SCORE_CAP_TIP_SUB: z.coerce.number().int().min(0).optional(),
  /** Credit score cache TTL in seconds */
  CREDIT_SCORE_CACHE_TTL_SECONDS: z.coerce.number().int().positive().optional(),
  /** Search results cache TTL in seconds */
  SEARCH_CACHE_TTL_SECONDS: z.coerce.number().int().positive().optional(),
  /**
   * TTL for analytics computed from raw tips (volume, top tippers, creator
   * analytics).
   */
  ANALYTICS_CACHE_TTL_SECONDS: z.coerce.number().int().positive().default(60),
  /**
   * TTL for analytics read from the AnalyticsDaily rollup.
   */
  ANALYTICS_ROLLUP_CACHE_TTL_SECONDS: z.coerce.number().int().positive().default(300),

  /**
   * Minimum withdrawal amount, in stroops (1 XLM = 10,000,000 stroops).
   */
  WITHDRAWAL_MIN_AMOUNT_STROOPS: z.coerce
    .bigint()
    .positive()
    .max(MAX_STROOP_AMOUNT)
    .default(10_000_000n),
  /** Withdrawal fee, in basis points (1/100th of a percent). 200 = 2%. */
  WITHDRAWAL_FEE_BPS: z.coerce.number().int().min(0).max(10_000).default(200),

  /**
   * Secret key for the platform's subscription-charge keeper account.
   */
  SUBSCRIPTION_KEEPER_SECRET_KEY: z.string().optional(),
  /** Cron expression for the subscription-charge processing job. */
  SUBSCRIPTION_CHARGE_CRON: z.string().default('0 * * * *'),

  X_API_BEARER_TOKEN: z.string().optional(),
  X_API_BASE_URL: z.string().default('https://api.twitter.com/2'),
  X_REFRESH_INTERVAL_MINUTES: z.coerce.number().default(30),
  X_QUOTA_FALLBACK_ENABLED: z.enum(['true', 'false']).default('true'),

  IPFS_API_URL: z.string().optional(),
  IPFS_GATEWAY_URL: z.string().default('https://ipfs.io/ipfs/'),
  IPFS_CLEANUP_GRACE_PERIOD_DAYS: z.coerce.number().default(30),
  COST_IPFS_REQUEST_USD: z.coerce.number().nonnegative().default(0),
  COST_SOROBAN_RPC_REQUEST_USD: z.coerce.number().nonnegative().default(0),
  COST_HORIZON_REQUEST_USD: z.coerce.number().nonnegative().default(0),

  /** Creator discovery — trending formula tuning. */
  DISCOVERY_TRENDING_WINDOW_DAYS: z.coerce.number().int().positive().default(14),
  /** Exponential-decay half-life (in days) for recency weighting. */
  DISCOVERY_TRENDING_HALFLIFE_DAYS: z.coerce.number().int().positive().default(7),
  DISCOVERY_TRENDING_TOP_N: z.coerce.number().int().positive().default(50),
  DISCOVERY_SIMILAR_TOP_N: z.coerce.number().int().positive().default(20),
  DISCOVERY_CACHE_TTL_SECONDS: z.coerce.number().int().positive().default(300),
  DISCOVERY_SCHEDULE_CRON: z.string().default('*/15 * * * *'),

  /** Public platform-stats endpoint tuning. */
  PLATFORM_STATS_CACHE_TTL_SECONDS: z.coerce.number().int().positive().default(300),
  PLATFORM_STATS_SCHEDULE_CRON: z.string().default('*/10 * * * *'),

  /**
   * Secret key for the platform's payout keeper account.
   */
  PAYOUT_KEEPER_SECRET_KEY: z.string().optional(),
  PAYOUT_SCHEDULE_CRON: z.string().default('*/30 * * * *'),
  /** Maximum payout attempts before the creator is notified and payout paused. */
  PAYOUT_MAX_ATTEMPTS: z.coerce.number().int().positive().default(5),
  /** Base backoff (seconds) for payout retries; grows exponentially. */
  PAYOUT_BACKOFF_BASE_SECONDS: z.coerce.number().int().positive().default(60),
  /** Floor on a scheduled payout amount, in stroops. */
  PAYOUT_MIN_AMOUNT_STROOPS: z.coerce
    .bigint()
    .positive()
    .max(MAX_STROOP_AMOUNT)
    .default(10_000_000n),

  /** OG image generation limits. */
  OG_IMAGE_TIMEOUT_MS: z.coerce.number().int().positive().default(3000),
  OG_IMAGE_CACHE_TTL_SECONDS: z.coerce.number().int().positive().default(86400),
  OG_IMAGE_CONCURRENCY: z.coerce.number().int().positive().default(4),

  IPFS_TIMEOUT_MS: z.coerce.number().int().positive().default(15_000),
  X_API_TIMEOUT_MS: z.coerce.number().int().positive().default(10_000),

  // Circuit breaker
  CIRCUIT_BREAKER_THRESHOLD: z.coerce.number().int().positive().default(5),
  CIRCUIT_BREAKER_RESET_TIMEOUT_MS: z.coerce.number().int().positive().default(30_000),

  // Retry with jitter
  RETRY_MAX_ATTEMPTS: z.coerce.number().int().positive().default(3),
  RETRY_INITIAL_DELAY_MS: z.coerce.number().int().positive().default(100),
  RETRY_MAX_DELAY_MS: z.coerce.number().int().positive().default(5_000),
  RETRY_FACTOR: z.coerce.number().positive().default(2),

  // Worker concurrency configuration
  WORKER_CONCURRENCY_SUBSCRIPTION_CHARGE: z.coerce.number().default(2),
  WORKER_CONCURRENCY_IPFS_PIN: z.coerce.number().default(3),
  WORKER_CONCURRENCY_IPFS_CLEANUP: z.coerce.number().default(2),
  WORKER_CONCURRENCY_X_REFRESH: z.coerce.number().default(1),

  // Realtime configuration
  SOCKET_IO_MAX_BUFFER_SIZE: z.coerce.number().default(1048576),
  SOCKET_IO_CONNECTION_TIMEOUT_MS: z.coerce.number().default(30000),
  SOCKET_IO_HEARTBEAT_INTERVAL_MS: z.coerce.number().default(25000),

  REALTIME_PING_INTERVAL_MS: z.coerce.number().default(25_000),
  REALTIME_PING_TIMEOUT_MS: z.coerce.number().default(20_000),
});

export type ServicesEnv = z.infer<typeof servicesEnvSchema>;
