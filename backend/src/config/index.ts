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
    jwtExpiresIn: env.JWT_EXPIRES_IN,
    refreshTokenExpiresIn: env.REFRESH_TOKEN_EXPIRES_IN,
    challengeTtlSeconds: env.AUTH_CHALLENGE_TTL_SECONDS,
  },

  retention: {
    pruneCron: env.RETENTION_PRUNE_CRON,
    batchSize: env.RETENTION_BATCH_SIZE,
  },

  stellar: {
    network: env.STELLAR_NETWORK,
    rpcUrl: env.SOROBAN_RPC_URL,
    horizonUrl: env.HORIZON_URL,
    networkPassphrase: env.NETWORK_PASSPHRASE,
    contractId: env.CONTRACT_ID,
    explorerBaseUrl: `https://stellar.expert/explorer/${env.STELLAR_NETWORK === 'MAINNET' ? 'public' : env.STELLAR_NETWORK.toLowerCase()}`,
  },

  indexer: {
    pollIntervalMs: env.INDEXER_POLL_INTERVAL_MS,
    startLedger: env.INDEXER_START_LEDGER,
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

  credit: {
    recomputeCron: env.CREDIT_RECOMPUTE_CRON,
  },

  analytics: {
    dailyCron: env.ANALYTICS_DAILY_CRON,
  },

  leaderboard: {
    snapshotCron: env.LEADERBOARD_SNAPSHOT_CRON,
  },

  withdrawals: {
    minAmountStroops: env.WITHDRAWAL_MIN_AMOUNT_STROOPS,
    feeBps: env.WITHDRAWAL_FEE_BPS,
  },

  subscriptions: {
    keeperSecretKey: env.SUBSCRIPTION_KEEPER_SECRET_KEY,
    chargeCron: env.SUBSCRIPTION_CHARGE_CRON,
  },

  discovery: {
    trendingWindowDays: env.DISCOVERY_TRENDING_WINDOW_DAYS,
    trendingHalflifeDays: env.DISCOVERY_TRENDING_HALFLIFE_DAYS,
    trendingTopN: env.DISCOVERY_TRENDING_TOP_N,
    similarTopN: env.DISCOVERY_SIMILAR_TOP_N,
    cacheTtlSeconds: env.DISCOVERY_CACHE_TTL_SECONDS,
    scheduleCron: env.DISCOVERY_SCHEDULE_CRON,
  },

  platformStats: {
    cacheTtlSeconds: env.PLATFORM_STATS_CACHE_TTL_SECONDS,
    scheduleCron: env.PLATFORM_STATS_SCHEDULE_CRON,
  },

  payouts: {
    keeperSecretKey: env.PAYOUT_KEEPER_SECRET_KEY,
    scheduleCron: env.PAYOUT_SCHEDULE_CRON,
    maxAttempts: env.PAYOUT_MAX_ATTEMPTS,
    backoffBaseSeconds: env.PAYOUT_BACKOFF_BASE_SECONDS,
    minAmountStroops: env.PAYOUT_MIN_AMOUNT_STROOPS,
  },

  og: {
    timeoutMs: env.OG_IMAGE_TIMEOUT_MS,
    cacheTtlSeconds: env.OG_IMAGE_CACHE_TTL_SECONDS,
    concurrency: env.OG_IMAGE_CONCURRENCY,
  },

  timeouts: {
    sorobanRpcMs: env.SOROBAN_RPC_TIMEOUT_MS,
    horizonMs: env.HORIZON_TIMEOUT_MS,
    ipfsMs: env.IPFS_TIMEOUT_MS,
    xApiMs: env.X_API_TIMEOUT_MS,
    requestMs: env.REQUEST_TIMEOUT_MS,
  },

  circuitBreaker: {
    threshold: env.CIRCUIT_BREAKER_THRESHOLD,
    resetTimeoutMs: env.CIRCUIT_BREAKER_RESET_TIMEOUT_MS,
    rpcThreshold: env.RPC_CIRCUIT_BREAKER_THRESHOLD,
    rpcResetTimeoutMs: env.RPC_CIRCUIT_BREAKER_RESET_TIMEOUT_MS,
    horizonThreshold: env.HORIZON_CIRCUIT_BREAKER_THRESHOLD,
    horizonResetTimeoutMs: env.HORIZON_CIRCUIT_BREAKER_RESET_TIMEOUT_MS,
  },

  retry: {
    maxAttempts: env.RETRY_MAX_ATTEMPTS,
    initialDelayMs: env.RETRY_INITIAL_DELAY_MS,
    maxDelayMs: env.RETRY_MAX_DELAY_MS,
    factor: env.RETRY_FACTOR,
  },

  payload: {
    jsonLimit: env.JSON_BODY_LIMIT,
    multerFileSize: env.MULTER_FILE_SIZE_LIMIT,
    multerFiles: env.MULTER_FILES_LIMIT,
    multerFields: env.MULTER_FIELDS_LIMIT,
  },

  logging: {
    level: env.LOG_LEVEL,
    sentryDsn: env.SENTRY_DSN,
  },
} as const;

export type Config = typeof config;
