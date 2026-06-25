import { describe, it, expect } from 'vitest';

describe('config/index', () => {
  it('exports grouped config domains', async () => {
    process.env.DATABASE_URL = 'postgresql://u:p@localhost:5432/db';
    process.env.REDIS_URL = 'redis://localhost:6379';
    process.env.JWT_SECRET = 'supersecretkey';
    process.env.SOROBAN_RPC_URL = 'https://soroban-testnet.stellar.org';
    process.env.HORIZON_URL = 'https://horizon-testnet.stellar.org';
    process.env.NETWORK_PASSPHRASE = 'Test SDF Network ; September 2015';

    const { config } = await import('../src/config/index.js');

    expect(config.server).toBeDefined();
    expect(config.db).toBeDefined();
    expect(config.redis).toBeDefined();
    expect(config.auth).toBeDefined();
    expect(config.stellar).toBeDefined();
    expect(config.indexer).toBeDefined();
    expect(config.twitter).toBeDefined();
    expect(config.ipfs).toBeDefined();
    expect(config.logging).toBeDefined();
  });

  it('exposes config.stellar.rpcUrl', async () => {
    const { config } = await import('../src/config/index.js');
    expect(typeof config.stellar.rpcUrl).toBe('string');
  });

  it('exposes config.auth.jwtSecret', async () => {
    const { config } = await import('../src/config/index.js');
    expect(typeof config.auth.jwtSecret).toBe('string');
  });
});
