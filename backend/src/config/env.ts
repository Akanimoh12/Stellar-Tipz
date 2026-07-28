import 'dotenv/config';
import { z } from 'zod';

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

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().default(4000),
  API_BASE_PATH: z.string().default('/api/v1'),
  CORS_ORIGIN: z.string().default('http://localhost:5173'),

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
  /** Minimum withdrawal amount, in stroops (1 XLM = 10,000,000 stroops). */
  WITHDRAWAL_MIN_AMOUNT_STROOPS: z.coerce.number().int().positive().default(10_000_000),
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

  LOG_LEVEL: z.string().default('info'),
  SENTRY_DSN: z.string().optional(),
});

export const env = envSchema.parse(process.env);
export type Env = z.infer<typeof envSchema>;
