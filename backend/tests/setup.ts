import { beforeAll } from 'vitest';

// Mock environment variables for testing
beforeAll(() => {
  process.env.NODE_ENV = 'test';
  process.env.PORT = '4000';
  process.env.API_BASE_PATH = '/api/v1';
  process.env.CORS_ORIGIN = 'http://localhost:5173';
  process.env.DATABASE_URL = 'postgresql://tipz:tipz@localhost:5432/tipz_test?schema=public';
  process.env.REDIS_URL = 'redis://localhost:6379';
  process.env.JWT_SECRET = 'test-secret-key-for-testing-only';
  process.env.JWT_EXPIRES_IN = '15m';
  process.env.REFRESH_TOKEN_EXPIRES_IN = '7d';
  process.env.AUTH_CHALLENGE_TTL_SECONDS = '300';
  process.env.STELLAR_NETWORK = 'TESTNET';
  process.env.SOROBAN_RPC_URL = 'https://soroban-testnet.stellar.org';
  process.env.HORIZON_URL = 'https://horizon-testnet.stellar.org';
  process.env.NETWORK_PASSPHRASE = 'Test SDF Network ; September 2015';
  process.env.INDEXER_POLL_INTERVAL_MS = '5000';
  process.env.LOG_LEVEL = 'error';
});
