import 'dotenv/config';
import { z } from 'zod';
import { parseCorsOrigins } from './cors.js';
import { MAX_STROOP_AMOUNT } from '../common/validation/stroops.js';

/**
 * Centralised, validated environment configuration.
 * Every module should import `env` from here rather than reading process.env directly.
 * See backend/.env.example for the full list of variables.
 */

/**
 * Validates a duration string like "15m", "7d", "30s", "2h".
 * Accepted units: s (seconds), m (minutes), h (hours), d (days).
 */
const durationString = z
  .string()
  .regex(/^\d+[smhd]$/, 'Must be a positive integer followed by s, m, h, or d (e.g. "15m", "7d")');

/** Accepts the literal strings "true"/"false" and coerces to a boolean (unlike z.coerce.boolean, which treats any non-empty string as true). */
const booleanString = z
  .enum(['true', 'false'])
  .default('true')
  .transform((value) => value === 'true');

export const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().default(4000),
  API_BASE_PATH: z.string().default('/api/v1'),
  /**
   * Comma-separated list of allowed CORS origins.
   * Validated as absolute http(s) origins. A wildcard ("*") is rejected because
   * the API always runs with credentials enabled, and localhost entries are
   * rejected in production. Invalid configuration fails at startup (issue #078).
   */
  CORS_ORIGIN: z
    .string()
    .default('http://localhost:5173')
    .transform((raw) => raw.split(',').map((entry) => entry.trim()).filter((entry) => entry.length > 0))
    .pipe(
      // Validate each origin (absolute http(s), no wildcard, no localhost in
      // prod). Done in a superRefine so an invalid origin becomes a zod parse
      // error and fails at startup rather than throwing through safeParse.
      z.array(z.string()).superRefine((origins, ctx) => {
        try {
          parseCorsOrigins(origins.join(','));
        } catch (e) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: (e as Error).message,
          });
        }
      }),
    ),

  /** Queries slower than this (ms) are logged as slow queries and counted (issue #095). */
  SLOW_QUERY_THRESHOLD_MS: z.coerce.number().int().positive().default(1000),

  /** Maximum PostgreSQL connections held by this process. */
  DATABASE_POOL_SIZE: z.coerce.number().int().positive().default(10),
  /** Seconds to wait for a free pooled connection before failing. */
  DATABASE_POOL_TIMEOUT_SECONDS: z.coerce.number().int().positive().default(10),
  /** PostgreSQL statement timeout applied to every Prisma connection. */
  DATABASE_QUERY_TIMEOUT_MS: z.coerce.number().int().positive().default(30_000),

  DATABASE_URL: z.string().url(),
  REDIS_URL: z.string().url(),
  /** Attaches the Socket.IO Redis adapter so realtime rooms are shared across horizontally scaled instances. */
  REALTIME_REDIS_ADAPTER_ENABLED: booleanString,

  JWT_SECRET: z.string().min(8),
  /** Access token TTL — must be a duration string like "15m" or "1h". */
  JWT_EXPIRES_IN: durationString.default('15m'),
  /** Refresh token TTL — must be a duration string like "7d" or "30d". */
  REFRESH_TOKEN_EXPIRES_IN: durationString.default('7d'),
  AUTH_CHALLENGE_TTL_SECONDS: z.coerce.number().default(300),

  STELLAR_NETWORK: z.enum(['TESTNET', 'FUTURENET', 'MAINNET']).default('TESTNET'),
  SOROBAN_RPC_URL: z.string().url(),
  HORIZON_URL: z.string().url(),
  NETWORK_PASSPHRASE: z.string(),
  CONTRACT_ID: z.string().optional(),

  INDEXER_POLL_INTERVAL_MS: z.coerce.number().default(5000),
  INDEXER_START_LEDGER: z.coerce.number().optional(),

  CREDIT_RECOMPUTE_CRON: z.string().default('0 */6 * * *'),
  /** Cron expression for the daily analytics rollup job. Runs at 00:05 UTC daily by default. */
  ANALYTICS_DAILY_CRON: z.string().default('5 0 * * *'),
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
   * Minimum withdrawal amount, in stroops (1 XLM = 10,000,000 stroops).
   * Stored and validated as a bigint at the config boundary — never a float —
   * so large XLM balances (which exceed JS number precision) are exact
   * (issue #088). Must be a positive integer within the int64 stroop range.
   */
  WITHDRAWAL_MIN_AMOUNT_STROOPS: z.coerce
    .bigint()
    .positive()
    .max(MAX_STROOP_AMOUNT)
    .default(10_000_000n),
  /** Withdrawal fee, in basis points (1/100th of a percent). 200 = 2%. */
  WITHDRAWAL_FEE_BPS: z.coerce.number().int().min(0).max(10_000).default(200),

  /**
   * Secret key for the platform's subscription-charge keeper account. Used
   * only by the subscription-charge job to sign `execute_due_subscription`
   * calls server-side (that contract function doesn't require the
   * subscriber's own signature). Optional so the app/tests can run without
   * it; the job itself throws a clear error per-subscription if it's unset.
   */
  SUBSCRIPTION_KEEPER_SECRET_KEY: z.string().optional(),
  /** Cron expression for the subscription-charge processing job. */
  SUBSCRIPTION_CHARGE_CRON: z.string().default('0 * * * *'),

  X_API_BEARER_TOKEN: z.string().optional(),
  X_API_BASE_URL: z.string().default('https://api.twitter.com/2'),

  IPFS_API_URL: z.string().optional(),
  IPFS_GATEWAY_URL: z.string().default('https://ipfs.io/ipfs/'),

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
   * Secret key for the platform's payout keeper account. Used only by the
   * scheduled-payout job to invoke the contract's `execute_scheduled_withdrawal`
   * on behalf of creators who have explicitly opted in (on-chain authorization).
   * Optional so the app/tests can run without it; the job throws a clear error
   * per-creator if it is unset. The keeper never holds creator funds or keys.
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

  /** OG image generation limits (memory/timeout guardrails). */
  OG_IMAGE_TIMEOUT_MS: z.coerce.number().int().positive().default(3000),
  OG_IMAGE_CACHE_TTL_SECONDS: z.coerce.number().int().positive().default(86400),
  OG_IMAGE_CONCURRENCY: z.coerce.number().int().positive().default(4),

  LOG_LEVEL: z.string().default('info'),
  SENTRY_DSN: z.string().optional(),
});

export const env = envSchema.parse(process.env);
export type Env = z.infer<typeof envSchema>;
