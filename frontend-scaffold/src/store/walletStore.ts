import { create } from 'zustand';
import { persist } from 'zustand/middleware';

type Network = 'TESTNET' | 'PUBLIC';

interface WalletState {
  publicKey: string | null;
  connected: boolean;
  connecting: boolean;
  error: string | null;
  network: Network;
}

interface WalletActions {
  connect: (publicKey: string) => void;
  disconnect: () => void;
  setConnecting: (connecting: boolean) => void;
  setError: (error: string | null) => void;
  setNetwork: (network: Network) => void;
}

type WalletStore = WalletState & WalletActions;

const initialWalletState: WalletState = {
  publicKey: null,
  connected: false,
  connecting: false,
  error: null,
  network: 'TESTNET',
};

export const useWalletStore = create<WalletStore>()(
  persist(
    (set) => ({
      ...initialWalletState,

      connect: (publicKey: string) =>
        set({ publicKey, connected: true, connecting: false, error: null }),

      disconnect: () => set({ publicKey: null, connected: false, error: null }),

      setConnecting: (connecting: boolean) => set({ connecting }),

      setError: (error: string | null) => set({ error, connecting: false }),

      setNetwork: (network: Network) => set({ network }),
    }),
    {
      name: 'tipz-wallet',
      partialize: (state) => ({
        publicKey: state.publicKey,
        connected: state.connected,
        network: state.network,
      }),
    }
  )
);
