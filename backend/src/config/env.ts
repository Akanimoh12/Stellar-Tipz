import 'dotenv/config';
import { z } from 'zod';

/**
 * Centralised, validated environment configuration.
 * Every module should import `env` from here rather than reading process.env directly.
 * See backend/.env.example for the full list of variables.
 */
const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().default(4000),
  API_BASE_PATH: z.string().default('/api/v1'),
  CORS_ORIGIN: z.string().default('http://localhost:5173'),

  DATABASE_URL: z.string().url(),
  REDIS_URL: z.string().url(),

  JWT_SECRET: z.string().min(8),
  JWT_EXPIRES_IN: z.string().default('15m'),
  REFRESH_TOKEN_EXPIRES_IN: z.string().default('7d'),
  AUTH_CHALLENGE_TTL_SECONDS: z.coerce.number().default(300),

  STELLAR_NETWORK: z.enum(['TESTNET', 'FUTURENET', 'MAINNET']).default('TESTNET'),
  SOROBAN_RPC_URL: z.string().url(),
  HORIZON_URL: z.string().url(),
  NETWORK_PASSPHRASE: z.string(),
  CONTRACT_ID: z.string().optional(),

  INDEXER_POLL_INTERVAL_MS: z.coerce.number().default(5000),
  INDEXER_START_LEDGER: z.coerce.number().optional(),

  X_API_BEARER_TOKEN: z.string().optional(),
  X_API_BASE_URL: z.string().default('https://api.twitter.com/2'),

  IPFS_API_URL: z.string().optional(),
  IPFS_GATEWAY_URL: z.string().default('https://ipfs.io/ipfs/'),

  LOG_LEVEL: z.string().default('info'),
  SENTRY_DSN: z.string().optional(),
});

export const env = envSchema.parse(process.env);
export type Env = z.infer<typeof envSchema>;
