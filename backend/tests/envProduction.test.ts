import { describe, it, expect } from 'vitest';
import { envSchema } from '../src/config/env.js';

function baseEnv(): Record<string, string> {
  return {
    NODE_ENV: 'production',
    DATABASE_URL: 'postgresql://u:p@localhost:5432/db',
    REDIS_URL: 'redis://localhost:6379',
    // Use a strong secret by default for production base
    JWT_SECRET: 'a-very-strong-jwt-secret-at-least-32-chars-long!!',
    SOROBAN_RPC_URL: 'https://mainnet.sorobanrpc.com',
    HORIZON_URL: 'https://horizon.stellar.org',
    NETWORK_PASSPHRASE: 'Public Global Stellar Network ; September 2015',
    CONTRACT_ID: 'CA3D5K7XK7Q5V5Z7O4X7K7Q5V5Z7O4X7K7Q5V5Z7O4X7K7Q5V5Z7O4X7K7Q5V5Z7O',
    CORS_ORIGIN: 'https://example.com',
    STELLAR_NETWORK: 'TESTNET',
  };
}

describe('env production constraints (issue #098)', () => {
  it('rejects JWT_SECRET shorter than 32 chars in production', () => {
    const result = envSchema.safeParse({ ...baseEnv(), JWT_SECRET: 'short123' });
    expect(result.success).toBe(false);
    if (!result.success) {
      const messages = result.error.issues.map((i) => i.message).join(' ');
      expect(messages).toContain('JWT_SECRET must be at least 32');
    }
  });

  it('rejects known default JWT_SECRET values', () => {
    const result = envSchema.safeParse({ ...baseEnv(), JWT_SECRET: 'change-me-in-production' });
    expect(result.success).toBe(false);
    if (!result.success) {
      const messages = result.error.issues.map((i) => i.message).join(' ');
      expect(messages.toLowerCase()).toContain('known default');
    }
  });

  it('rejects weak JWT_SECRET test placeholder', () => {
    const result = envSchema.safeParse({ ...baseEnv(), JWT_SECRET: 'test-secret-key-for-testing' });
    expect(result.success).toBe(false);
  });

  it('requires CONTRACT_ID in production', () => {
    const env = { ...baseEnv() };
    delete (env as Record<string, unknown>).CONTRACT_ID;
    const result = envSchema.safeParse(env);
    expect(result.success).toBe(false);
    if (!result.success) {
      const messages = result.error.issues.map((i) => i.message).join(' ');
      expect(messages).toContain('CONTRACT_ID is required');
    }
  });

  it('rejects empty CONTRACT_ID in production', () => {
    const result = envSchema.safeParse({ ...baseEnv(), CONTRACT_ID: '' });
    expect(result.success).toBe(false);
  });

  it('allows short JWT_SECRET and missing CONTRACT_ID in development', () => {
    const result = envSchema.safeParse({
      ...baseEnv(),
      NODE_ENV: 'development',
      JWT_SECRET: 'short123',
      CONTRACT_ID: undefined,
    });
    // Should fail for other reasons? Actually short JWT_SECRET min 8 still applies, but 8 chars is okay
    // Use 8-char secret
    const result2 = envSchema.safeParse({
      ...baseEnv(),
      NODE_ENV: 'development',
      JWT_SECRET: '12345678',
      CONTRACT_ID: undefined,
    });
    // In dev, production constraints should not trigger, so 8-char secret passes (min 8) and no CONTRACT_ID passes
    expect(result2.success).toBe(true);
  });

  describe('STELLAR_NETWORK=MAINNET consistency', () => {
    it('requires mainnet passphrase', () => {
      const result = envSchema.safeParse({
        ...baseEnv(),
        STELLAR_NETWORK: 'MAINNET',
        NETWORK_PASSPHRASE: 'Test SDF Network ; September 2015',
      });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues.some((i) => i.path.includes('NETWORK_PASSPHRASE'))).toBe(true);
      }
    });

    it('requires mainnet HORIZON_URL', () => {
      const result = envSchema.safeParse({
        ...baseEnv(),
        STELLAR_NETWORK: 'MAINNET',
        HORIZON_URL: 'https://horizon-testnet.stellar.org',
      });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues.some((i) => i.path.includes('HORIZON_URL'))).toBe(true);
      }
    });

    it('requires mainnet SOROBAN_RPC_URL without testnet', () => {
      const result = envSchema.safeParse({
        ...baseEnv(),
        STELLAR_NETWORK: 'MAINNET',
        SOROBAN_RPC_URL: 'https://soroban-testnet.stellar.org',
      });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues.some((i) => i.path.includes('SOROBAN_RPC_URL'))).toBe(true);
      }
    });

    it('requires SOROBAN_RPC_URL to contain mainnet hint', () => {
      const result = envSchema.safeParse({
        ...baseEnv(),
        STELLAR_NETWORK: 'MAINNET',
        SOROBAN_RPC_URL: 'https://example.com/rpc',
      });
      expect(result.success).toBe(false);
    });

    it('passes with correct mainnet values', () => {
      const result = envSchema.safeParse({
        ...baseEnv(),
        STELLAR_NETWORK: 'MAINNET',
        SOROBAN_RPC_URL: 'https://mainnet.sorobanrpc.com',
        HORIZON_URL: 'https://horizon.stellar.org',
        NETWORK_PASSPHRASE: 'Public Global Stellar Network ; September 2015',
      });
      expect(result.success).toBe(true);
    });
  });

  it('reports ALL violations together (not one-at-a-time)', () => {
    const result = envSchema.safeParse({
      ...baseEnv(),
      JWT_SECRET: 'short',
      CONTRACT_ID: '',
      STELLAR_NETWORK: 'MAINNET',
      SOROBAN_RPC_URL: 'https://soroban-testnet.stellar.org',
      HORIZON_URL: 'https://horizon-testnet.stellar.org',
      NETWORK_PASSPHRASE: 'Wrong passphrase',
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      // Should have multiple issues, at least JWT, CONTRACT_ID, and mainnet fields
      expect(result.error.issues.length).toBeGreaterThan(3);
      const paths = result.error.issues.map((i) => i.path.join('.'));
      expect(paths).toContain('JWT_SECRET');
      expect(paths).toContain('CONTRACT_ID');
      expect(paths).toContain('SOROBAN_RPC_URL');
      expect(paths).toContain('HORIZON_URL');
      expect(paths).toContain('NETWORK_PASSPHRASE');
    }
  });

  it('CSP_REPORT_URI must be valid URL when set', () => {
    const result = envSchema.safeParse({ ...baseEnv(), CSP_REPORT_URI: 'not-a-url' });
    expect(result.success).toBe(false);
  });

  it('CSP_REPORT_URI optional', () => {
    const result = envSchema.safeParse({ ...baseEnv() });
    expect(result.success).toBe(true);
  });
});
