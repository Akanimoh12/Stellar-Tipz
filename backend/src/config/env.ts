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

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().default(4000),
  API_BASE_PATH: z.string().default('/api/v1'),
  CORS_ORIGIN: z.string().default('http://localhost:5173'),

  DATABASE_URL: z.string().url(),
  REDIS_URL: z.string().url(),

  JWT_SECRET: z.string().min(8),
  /**
   * Optional JSON or comma-separated map of kid->secret for key rotation.
   * Supported formats:
   *  - JSON object: '{"kid1":"secret1","kid2":"secret2"}'
   *  - JSON array:  '[{"kid":"kid1","secret":"secret1"}]'
   *  - CSV:         'kid1:secret1,kid2:secret2'
   * When absent, single-secret mode is used (kid="primary").
   * Rotation: add new kid/secret to this map, set JWT_CURRENT_KID to the new kid,
   * keep old keys for at least 2× JWT_EXPIRES_IN (documented window) to allow
   * in-flight tokens to expire, then remove the retired kid.
   */
  JWT_SECRETS: z.string().optional(),
  /** Kid to use when signing new tokens. Must exist in JWT_SECRETS when rotation is configured. */
  JWT_CURRENT_KID: z.string().optional(),
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
  /** Minimum withdrawal amount, in stroops (1 XLM = 10,000,000 stroops). */
  WITHDRAWAL_MIN_AMOUNT_STROOPS: z.coerce.number().int().positive().default(10_000_000),

  X_API_BEARER_TOKEN: z.string().optional(),
  X_API_BASE_URL: z.string().default('https://api.twitter.com/2'),

  IPFS_API_URL: z.string().optional(),
  IPFS_GATEWAY_URL: z.string().default('https://ipfs.io/ipfs/'),

  LOG_LEVEL: z.string().default('info'),
  SENTRY_DSN: z.string().optional(),
});

export const env = envSchema.parse(process.env);
export type Env = z.infer<typeof envSchema>;
