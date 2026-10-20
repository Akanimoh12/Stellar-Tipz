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

  realtime: {
    redisAdapterEnabled: env.REALTIME_REDIS_ADAPTER_ENABLED,
  },

  auth: {
    jwtSecret: env.JWT_SECRET,
    jwtSecrets: env.JWT_SECRETS,
    jwtCurrentKid: env.JWT_CURRENT_KID,
    jwtExpiresIn: env.JWT_EXPIRES_IN,
    refreshTokenExpiresIn: env.REFRESH_TOKEN_EXPIRES_IN,
    challengeTtlSeconds: env.AUTH_CHALLENGE_TTL_SECONDS,
    challengeCleanupCron: env.AUTH_CHALLENGE_CLEANUP_CRON,
    rateLimitPerIp: env.AUTH_RATE_LIMIT_PER_IP,
    rateLimitPerAddress: env.AUTH_RATE_LIMIT_PER_ADDRESS,
    rateLimitWindowMs: env.AUTH_RATE_LIMIT_WINDOW_MS,
  },

  retention: {
    pruneCron: env.RETENTION_PRUNE_CRON,
    batchSize: env.RETENTION_BATCH_SIZE,
  },

  stellar: {
    network: env.STELLAR_NETWORK,
    rpcUrl: env.SOROBAN_RPC_URL,
    horizonUrl: env.HORIZON_URL,
    rpcFallbackUrls: env.SOROBAN_RPC_FALLBACK_URLS,
    horizonFallbackUrls: env.HORIZON_FALLBACK_URLS,
    networkPassphrase: env.NETWORK_PASSPHRASE,
    contractId: env.CONTRACT_ID,
    explorerBaseUrl: `https://stellar.expert/explorer/${env.STELLAR_NETWORK === 'MAINNET' ? 'public' : (env.STELLAR_NETWORK ?? 'TESTNET').toLowerCase()}`,
  },

  indexer: {
    pollIntervalMs: env.INDEXER_POLL_INTERVAL_MS,
    startLedger: env.INDEXER_START_LEDGER,
    lagThresholdLedgers: env.INDEXER_LAG_THRESHOLD_LEDGERS,
    stallIntervals: env.INDEXER_STALL_INTERVALS,
    /** Confirmation depth before an event is projected (issue #1257). */
    finalityDepth: env.INDEXER_FINALITY_DEPTH,
    /** Recent ledger hashes retained for reorg detection (issue #1257). */
    reorgLookback: env.INDEXER_REORG_LOOKBACK,
    /** Redis lease-based leader election across indexer instances (issue #1263). */
    leaderElection: {
      enabled: env.INDEXER_LEADER_ELECTION_ENABLED,
      key: env.INDEXER_LEADER_KEY,
      leaseMs: env.INDEXER_LEADER_LEASE_MS,
      renewIntervalMs: env.INDEXER_LEADER_RENEW_INTERVAL_MS,
    },
  },

  treasury: {
    address: env.TREASURY_ADDRESS,
    openingBalanceStroops: env.TREASURY_OPENING_BALANCE_STROOPS,
    monitorCron: env.TREASURY_MONITOR_CRON,
  },

  twitter: {
    bearerToken: env.X_API_BEARER_TOKEN,
    baseUrl: env.X_API_BASE_URL,
    metricsRefreshCron: env.X_METRICS_REFRESH_CRON,
  },

  ipfs: {
    apiUrl: env.IPFS_API_URL,
    gatewayUrl: env.IPFS_GATEWAY_URL,
  },

  realtime: {
    pingIntervalMs: env.REALTIME_PING_INTERVAL_MS ?? 25_000,
    pingTimeoutMs: env.REALTIME_PING_TIMEOUT_MS ?? 20_000,
    redisAdapterEnabled: env.REALTIME_REDIS_ADAPTER_ENABLED === 'true',
  },

  logging: {
    level: env.LOG_LEVEL,
    sentryDsn: env.SENTRY_DSN,
  },

  tracing: {
    enabled: env.OTEL_ENABLED,
    serviceName: env.OTEL_SERVICE_NAME,
    otlpEndpoint: env.OTEL_EXPORTER_OTLP_ENDPOINT,
    sampleRate: env.OTEL_SAMPLE_RATE,
  },
} as const;

export type Config = typeof config;
