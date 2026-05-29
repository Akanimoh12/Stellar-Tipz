import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import { secureStorage } from "../services/secureStorage";
import type { WalletErrorType } from "../helpers/error";
import { setUser } from "../services/sentry";

export type Network = 'TESTNET' | 'PUBLIC';
type SigningStatus = 'idle' | 'signing' | 'signed' | 'error';

export interface WalletError {
  type: WalletErrorType;
  message: string;
}

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
  walletError: WalletError | null;
  network: Network;
  /** walletType of the active wallet (backward-compat). */
  walletType: string | null;
  signingStatus: SigningStatus;
  _hasHydrated: boolean;
  /** Unix timestamp (ms) when the current session expires. Null when disconnected. */
  sessionExpiresAt: number | null;
}

interface WalletActions {
  /** Add (or activate) a wallet. If already in the list it becomes active. */
  connect: (publicKey: string, walletType?: string) => void;
  setAddress: (publicKey: string, walletType?: string) => void;
  /** Disconnect all wallets and clear all persisted session data. */
  disconnect: () => void;
  clearAddress: () => void;
  /** Remove a specific wallet from the list. */
  removeWallet: (publicKey: string) => void;
  /** Switch the active wallet used for signing. */
  setActiveWallet: (publicKey: string) => void;
  setConnecting: (connecting: boolean) => void;
  setReconnecting: (isReconnecting: boolean) => void;
  setError: (error: string | null) => void;
  setWalletError: (walletError: WalletError | null) => void;
  setNetwork: (network: Network) => void;
  setSigningStatus: (status: SigningStatus) => void;
  /** Extend the session expiry timestamp (called on user activity). */
  refreshSession: (timeoutMs?: number) => void;
}

type WalletStore = WalletState & WalletActions;

const SESSION_TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes

const initialWalletState: WalletState = {
  wallets: [],
  activeWalletKey: null,
  publicKey: null,
  connected: false,
  connecting: false,
  isReconnecting: false,
  error: null,
  walletError: null,
  network: "TESTNET",
  walletType: null,
  signingStatus: "idle",
  _hasHydrated: false,
  sessionExpiresAt: null,
};

export const useWalletStore = create<WalletStore>()(
  persist(
    (set, get) => ({
      ...initialWalletState,

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
          walletError: null,
          walletType: wt,
          sessionExpiresAt: Date.now() + SESSION_TIMEOUT_MS,
        });
        setUser(publicKey);
      },

      setAddress: (publicKey: string, walletType?: string) => {
        get().connect(publicKey, walletType);
      },

      disconnect: () => {
        setUser(null);
        set({
          wallets: [],
          activeWalletKey: null,
          publicKey: null,
          connected: false,
          error: null,
          walletError: null,
          walletType: null,
          signingStatus: 'idle',
          sessionExpiresAt: null,
        });
      },

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

      setWalletError: (walletError: WalletError | null) => set({ walletError }),

      setNetwork: (network: Network) => set({ network }),

      setSigningStatus: (signingStatus: SigningStatus) => set({ signingStatus }),

      refreshSession: (timeoutMs = SESSION_TIMEOUT_MS) => {
        if (!get().connected) return;
        set({ sessionExpiresAt: Date.now() + timeoutMs });
      },
    }),
    {
      name: "tipz-wallet",
      onRehydrateStorage: () => (state) => {
        if (state) {
          state._hasHydrated = true;
        }
      },
      storage: createJSONStorage(() => ({
        getItem: (name) => secureStorage.get(name),
        setItem: (name, value) => secureStorage.set(name, value),
        removeItem: async (name) => {
          secureStorage.remove(name);
        },
      })),
      partialize: (state) => ({
        wallets: state.wallets,
        activeWalletKey: state.activeWalletKey,
        walletType: state.walletType,
        network: state.network,
        publicKey: state.publicKey,
        connected: state.connected,
        sessionExpiresAt: state.sessionExpiresAt,
      }),
    },
  ),
);
