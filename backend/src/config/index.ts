import { env } from './env.js';

/**
 * Typed, domain-grouped config object.
 * Modules should import `config` from here rather than `env` directly.
 *
 * @example
 *   import { config } from '../config/index.js';
 *   const rpc = config.stellar.rpcUrl;
 */
export const config = {
  server: {
    nodeEnv: env.NODE_ENV,
    port: env.PORT,
    apiBasePath: env.API_BASE_PATH,
    corsOrigin: env.CORS_ORIGIN,
  },

  db: {
    databaseUrl: env.DATABASE_URL,
  },

  redis: {
    redisUrl: env.REDIS_URL,
  },

  auth: {
    jwtSecret: env.JWT_SECRET,
    jwtExpiresIn: env.JWT_EXPIRES_IN,
    refreshTokenExpiresIn: env.REFRESH_TOKEN_EXPIRES_IN,
    challengeTtlSeconds: env.AUTH_CHALLENGE_TTL_SECONDS,
  },

  stellar: {
    network: env.STELLAR_NETWORK,
    rpcUrl: env.SOROBAN_RPC_URL,
    horizonUrl: env.HORIZON_URL,
    networkPassphrase: env.NETWORK_PASSPHRASE,
    contractId: env.CONTRACT_ID,
  },

  indexer: {
    pollIntervalMs: env.INDEXER_POLL_INTERVAL_MS,
    startLedger: env.INDEXER_START_LEDGER,
  },

  twitter: {
    bearerToken: env.X_API_BEARER_TOKEN,
    baseUrl: env.X_API_BASE_URL,
  },

  ipfs: {
    apiUrl: env.IPFS_API_URL,
    gatewayUrl: env.IPFS_GATEWAY_URL,
  },

  logging: {
    level: env.LOG_LEVEL,
    sentryDsn: env.SENTRY_DSN,
  },
} as const;

export type Config = typeof config;
