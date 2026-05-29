import { describe, expect, it, vi } from 'vitest';

import { getEnv, validateEnv } from '../env';

describe('env helper', () => {
  it('uses default config when variables are missing', () => {
    expect(getEnv({})).toEqual({
      sorobanRpcUrl: 'https://soroban-testnet.stellar.org',
      horizonUrl: 'https://horizon-testnet.stellar.org',
      networkPassphrase: 'Test SDF Network ; September 2015',
      contractId: '',
      network: 'TESTNET',
      useMockData: false,
    });
  });



  it('uses empty string for contractId when variable is missing', () => {
    expect(getEnv({}).contractId).toBe('');
  });

  it('can read runtime defaults without explicit map', () => {
    const runtimeEnv = getEnv();
    expect(runtimeEnv.network).toBeDefined();
    expect(runtimeEnv.horizonUrl.length).toBeGreaterThan(0);
  });

  it('reads values from provided env map', () => {
    expect(
      getEnv({
        VITE_SOROBAN_RPC_URL: 'https://rpc.example',
        VITE_HORIZON_URL: 'https://horizon.example',
        VITE_NETWORK_PASSPHRASE: 'Custom passphrase',
        VITE_CONTRACT_ID: 'ABC123',
        VITE_NETWORK: 'FUTURENET',
        VITE_USE_MOCK_DATA: 'true',
      }),
    ).toEqual({
      sorobanRpcUrl: 'https://rpc.example',
      horizonUrl: 'https://horizon.example',
      networkPassphrase: 'Custom passphrase',
      contractId: 'ABC123',
      network: 'FUTURENET',
      useMockData: true,
    });
  });
});

describe('validateEnv', () => {
  it('throws on missing VITE_CONTRACT_ID', () => {
    expect(() => validateEnv({})).toThrow(/VITE_CONTRACT_ID is required/);
  });

  it('throws when VITE_CONTRACT_ID is empty string', () => {
    expect(() => validateEnv({ VITE_CONTRACT_ID: '' })).toThrow(/VITE_CONTRACT_ID is required/);
  });

  it('validates RPC URL format', () => {
    expect(() =>
      validateEnv({ VITE_CONTRACT_ID: 'ABC', VITE_SOROBAN_RPC_URL: 'not-a-url' }),
    ).toThrow(/must be a valid URL/);
  });

  it('validates Horizon URL format', () => {
    expect(() =>
      validateEnv({ VITE_CONTRACT_ID: 'ABC', VITE_HORIZON_URL: 'not-a-url' }),
    ).toThrow(/must be a valid URL/);
  });

  it('warns on missing optional VITE_SENTRY_DSN', () => {
    const spy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    validateEnv({ VITE_CONTRACT_ID: 'ABC' });
    expect(spy).toHaveBeenCalledWith(expect.stringContaining('VITE_SENTRY_DSN'));
    spy.mockRestore();
  });

  it('does not warn when VITE_SENTRY_DSN is set', () => {
    const spy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    validateEnv({ VITE_CONTRACT_ID: 'ABC', VITE_SENTRY_DSN: 'https://sentry.example/1' });
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  it('passes with valid required and optional vars', () => {
    expect(() =>
      validateEnv({
        VITE_CONTRACT_ID: 'ABC123',
        VITE_SOROBAN_RPC_URL: 'https://soroban-testnet.stellar.org',
        VITE_SENTRY_DSN: 'https://sentry.example/1',
      }),
    ).not.toThrow();
  });
});
