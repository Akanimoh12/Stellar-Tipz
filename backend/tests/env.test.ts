import { describe, expect, it } from 'vitest';
import { parseCorsOrigins } from '../src/config/cors.js';
import { envSchema } from '../src/config/env.js';

describe('parseCorsOrigins (issue #078)', () => {
  it('accepts a single valid http origin', () => {
    expect(parseCorsOrigins('https://tipz.example.com')).toEqual(['https://tipz.example.com']);
  });

  it('accepts a comma-separated list and trims whitespace', () => {
    expect(parseCorsOrigins('https://a.example.com, https://b.example.com')).toEqual([
      'https://a.example.com',
      'https://b.example.com',
    ]);
  });

  it('rejects a wildcard because credentials are enabled', () => {
    expect(() => parseCorsOrigins('*')).toThrow();
    expect(() => parseCorsOrigins('https://a.example.com,*')).toThrow();
  });

  it('rejects a non-origin / invalid URL', () => {
    expect(() => parseCorsOrigins('not-a-url')).toThrow();
    expect(() => parseCorsOrigins('ftp://example.com')).toThrow();
  });

  it('rejects an origin with a path', () => {
    expect(() => parseCorsOrigins('https://example.com/path')).toThrow();
  });

  it('rejects a localhost origin in production', () => {
    const prev = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';
    try {
      expect(() => parseCorsOrigins('http://localhost:5173')).toThrow();
    } finally {
      process.env.NODE_ENV = prev;
    }
  });

  it('allows a localhost origin outside production', () => {
    const prev = process.env.NODE_ENV;
    process.env.NODE_ENV = 'test';
    try {
      expect(parseCorsOrigins('http://localhost:5173')).toEqual(['http://localhost:5173']);
    } finally {
      process.env.NODE_ENV = prev;
    }
  });
});

describe('env schema CORS validation (issue #078)', () => {
  it('fails at boot on a wildcard origin', () => {
    const result = envSchema.safeParse({ ...baseEnv(), CORS_ORIGIN: '*' });
    expect(result.success).toBe(false);
  });

  it('fails at boot on a malformed origin', () => {
    const result = envSchema.safeParse({ ...baseEnv(), CORS_ORIGIN: 'https://a.example.com,garbage' });
    expect(result.success).toBe(false);
  });

  it('parses a valid origin list into an array', () => {
    const result = envSchema.safeParse({
      ...baseEnv(),
      CORS_ORIGIN: 'https://a.example.com,https://b.example.com',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.CORS_ORIGIN).toEqual(['https://a.example.com', 'https://b.example.com']);
    }
  });

  it('parses stroop amounts as bigint at the config boundary (issue #088)', () => {
    const result = envSchema.safeParse({ ...baseEnv() });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.WITHDRAWAL_MIN_AMOUNT_STROOPS).toBe(10_000_000n);
      expect(result.data.PAYOUT_MIN_AMOUNT_STROOPS).toBe(10_000_000n);
    }
  });
});

function baseEnv(): Record<string, string> {
  return {
    NODE_ENV: 'test',
    DATABASE_URL: 'postgresql://u:p@localhost:5432/db',
    REDIS_URL: 'redis://localhost:6379',
    JWT_SECRET: 'test-secret-key-for-testing',
    SOROBAN_RPC_URL: 'https://soroban-testnet.stellar.org',
    HORIZON_URL: 'https://horizon-testnet.stellar.org',
    NETWORK_PASSPHRASE: 'Test SDF Network ; September 2015',
    CORS_ORIGIN: 'http://localhost:5173',
  };
}
