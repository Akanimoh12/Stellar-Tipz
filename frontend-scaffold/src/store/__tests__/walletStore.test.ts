import { beforeEach, describe, expect, it } from 'vitest';
import { useWalletStore } from '../walletStore';

const STORAGE_KEY = 'tipz-wallet';

const resetWalletStore = () => {
  useWalletStore.setState({
    publicKey: null,
    connected: false,
    connecting: false,
    error: null,
    network: 'TESTNET',
  });
};

describe('walletStore persistence', () => {
  beforeEach(() => {
    localStorage.clear();
    resetWalletStore();
  });

  it('persists the wallet connection subset to localStorage', () => {
    useWalletStore.getState().setNetwork('PUBLIC');
    useWalletStore.getState().connect('GD1234567890ABCDEF');

    const persisted = localStorage.getItem(STORAGE_KEY);

    expect(persisted).not.toBeNull();
    expect(JSON.parse(persisted!)).toEqual({
      state: {
        publicKey: 'GD1234567890ABCDEF',
        connected: true,
        network: 'PUBLIC',
      },
      version: 0,
    });
  });

  it('rehydrates the persisted wallet connection state', async () => {
    resetWalletStore();
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        state: {
          publicKey: 'GDREHYDRATED123456',
          connected: true,
          network: 'PUBLIC',
        },
        version: 0,
      })
    );

    await useWalletStore.persist.rehydrate();

    expect(useWalletStore.getState()).toMatchObject({
      publicKey: 'GDREHYDRATED123456',
      connected: true,
      network: 'PUBLIC',
      connecting: false,
      error: null,
    });
  });
});
