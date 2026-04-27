import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import { secureStorage } from "../services/secureStorage";

export type Network = 'TESTNET' | 'PUBLIC';
type SigningStatus = 'idle' | 'signing' | 'signed' | 'error';

/** A single connected wallet entry. */
export interface ConnectedWallet {
  publicKey: string;
  walletType: string;
}

interface WalletState {
  /** All currently connected wallets. */
  wallets: ConnectedWallet[];
  /** Public key of the wallet used for transactions. */
  activeWalletKey: string | null;

  // ── Derived / single-wallet compat fields ──────────────────────────────
  /** Mirrors activeWalletKey for backward-compat with components that read publicKey. */
  publicKey: string | null;
  /** True when at least one wallet is connected. */
  connected: boolean;
  connecting: boolean;
  isReconnecting: boolean;
  error: string | null;
  network: Network;
  /** walletType of the active wallet (backward-compat). */
  walletType: string | null;
  signingStatus: SigningStatus;
  _hasHydrated: boolean;
}

interface WalletActions {
  /** Add (or activate) a wallet. If already in the list it becomes active. */
  connect: (publicKey: string, walletType?: string) => void;
  setAddress: (publicKey: string, walletType?: string) => void;
  /** Disconnect all wallets and clear persisted state. */
  disconnect: () => void;
  clearAddress: () => void;
  /** Remove a specific wallet from the list. */
  removeWallet: (publicKey: string) => void;
  /** Switch the active wallet used for signing. */
  setActiveWallet: (publicKey: string) => void;
  setConnecting: (connecting: boolean) => void;
  setReconnecting: (isReconnecting: boolean) => void;
  setError: (error: string | null) => void;
  setNetwork: (network: Network) => void;
  setSigningStatus: (status: SigningStatus) => void;
}

type WalletStore = WalletState & WalletActions;

const initialWalletState: WalletState = {
  publicKey: null,
  connected: false,
  connecting: false,
  isReconnecting: false,
  error: null,
  network: "TESTNET",
  walletType: null,
  signingStatus: "idle",
  _hasHydrated: false,
};

export const useWalletStore = create<WalletStore>()(
  persist(
    (set, get) => ({
      wallets: [],
      activeWalletKey: null,
      publicKey: null,
      connected: false,
      connecting: false,
      isReconnecting: false,
      error: null,
      network: 'TESTNET',
      walletType: null,
      signingStatus: 'idle',

      connect: (publicKey: string, walletType?: string) => {
        const { wallets } = get();
        const wt = walletType ?? null;
        const already = wallets.find((w) => w.publicKey === publicKey);
        const updatedWallets: ConnectedWallet[] = already
          ? wallets
          : [...wallets, { publicKey, walletType: wt ?? 'unknown' }];
        set({
          wallets: updatedWallets,
          activeWalletKey: publicKey,
          publicKey,
          connected: true,
          connecting: false,
          isReconnecting: false,
          error: null,
          walletType: wt,
        });
      },

      setAddress: (publicKey: string, walletType?: string) => {
        get().connect(publicKey, walletType);
      },

      disconnect: () =>
        set({
          wallets: [],
          activeWalletKey: null,
          publicKey: null,
          connected: false,
          error: null,
          walletType: null,
          signingStatus: 'idle',
        }),

      clearAddress: () => {
        get().disconnect();
      },

      removeWallet: (publicKey: string) => {
        const { wallets, activeWalletKey } = get();
        const remaining = wallets.filter((w) => w.publicKey !== publicKey);
        const newActive =
          activeWalletKey === publicKey
            ? (remaining[0]?.publicKey ?? null)
            : activeWalletKey;
        const newActiveWallet = remaining.find((w) => w.publicKey === newActive) ?? null;
        set({
          wallets: remaining,
          activeWalletKey: newActive,
          publicKey: newActive,
          connected: remaining.length > 0,
          walletType: newActiveWallet?.walletType ?? null,
        });
      },

      setActiveWallet: (publicKey: string) => {
        const { wallets } = get();
        const wallet = wallets.find((w) => w.publicKey === publicKey);
        if (!wallet) return;
        set({
          activeWalletKey: publicKey,
          publicKey,
          walletType: wallet.walletType,
        });
      },

      setConnecting: (connecting: boolean) => set({ connecting }),

      setReconnecting: (isReconnecting: boolean) => set({ isReconnecting }),

      setError: (error: string | null) => set({ error, connecting: false, isReconnecting: false }),

      setNetwork: (network: Network) => set({ network }),

      setSigningStatus: (signingStatus: SigningStatus) => set({ signingStatus }),
    }),
    {
      name: "tipz-wallet",
      onRehydrateStorage: () => (state) => {
        state?._hasHydrated = true;
      },
      storage: createJSONStorage(() => ({
        getItem: (name) => secureStorage.get(name),
        setItem: (name, value) => secureStorage.set(name, value),
        removeItem: (name) => secureStorage.remove(name),
      })),
      partialize: (state) => ({
        wallets: state.wallets,
        activeWalletKey: state.activeWalletKey,
        walletType: state.walletType,
        network: state.network,
        publicKey: state.publicKey,
        connected: state.connected,
      }),
    },
  ),
);
