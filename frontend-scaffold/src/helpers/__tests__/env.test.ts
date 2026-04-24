import { describe, expect, it } from 'vitest';

import { getEnv } from '../env';

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
