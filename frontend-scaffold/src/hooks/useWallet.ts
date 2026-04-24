import { useMemo, useEffect, useRef } from "react";
import {
  StellarWalletsKit,
  WalletNetwork,
  FREIGHTER_ID,
  FreighterModule,
  AlbedoModule,
  xBullModule,
} from "@creit.tech/stellar-wallets-kit";
import { signTx } from "../helpers/network";
import { useWalletStore } from "../store/walletStore";

interface Freighter {
  getNetwork: () => Promise<string>;
  getAddress: () => Promise<string>;
}

let kitInstance: StellarWalletsKit | null = null;
let currentNetwork: WalletNetwork | null = null;

type DisposableWalletKit = StellarWalletsKit & {
  closeModal?: () => void;
  disconnect?: () => void | Promise<void>;
  destroy?: () => void;
  removeAllListeners?: () => void;
};

const disposeKit = (kit: StellarWalletsKit | null) => {
  const disposableKit = kit as DisposableWalletKit | null;
  if (!disposableKit) return;

  try {
    disposableKit.closeModal?.();
  } catch (error) {
    console.warn("Failed to close wallet modal during cleanup:", error);
  }

  try {
    void disposableKit.disconnect?.();
  } catch (error) {
    console.warn("Failed to disconnect wallet kit during cleanup:", error);
  }

  try {
    disposableKit.removeAllListeners?.();
    disposableKit.destroy?.();
  } catch (error) {
    console.warn("Failed to fully dispose wallet kit during cleanup:", error);
  }
};

const getKit = (network: WalletNetwork) => {
  if (!kitInstance || currentNetwork !== network) {
    disposeKit(kitInstance);
    kitInstance = new StellarWalletsKit({
      network,
      selectedWalletId: FREIGHTER_ID,
      modules: [new FreighterModule(), new AlbedoModule(), new xBullModule()],
    });
    currentNetwork = network;
  }
  return kitInstance;
};

const AUTO_RECONNECT_TIMEOUT_MS = 5000;

export const SUPPORTED_WALLETS = [
  {
    id: "freighter",
    name: "Freighter",
    installUrl: "https://www.freighter.app/",
    recommended: true,
  },
  {
    id: "xbull",
    name: "xBull",
    installUrl: "https://xbull.app/",
  },
  {
    id: "albedo",
    name: "Albedo",
    installUrl: "https://albedo.link/",
  },
];

const isWalletInstalled = (id: string): boolean => {
  if (typeof window === "undefined") return false;
  const win = window as unknown as {
    freighter?: unknown;
    xBullWallet?: unknown;
    albedo?: unknown;
  };
  switch (id) {
    case "freighter":
      return !!win.freighter;
    case "xbull":
      return !!win.xBullWallet;
    case "albedo":
      return !!win.albedo;
    default:
      return false;
  }
};

export const useWallet = () => {
  const {
    wallets,
    activeWalletKey,
    publicKey,
    connected,
    connecting,
    isReconnecting,
    error,
    network,
    walletType,
    signingStatus,
    connect,
    disconnect,
    removeWallet,
    setActiveWallet,
    setConnecting,
    setReconnecting,
    setError,
    setNetwork: storeSetNetwork,
    setSigningStatus,
  } = useWalletStore();

  const kitNetwork =
    network === "PUBLIC" ? WalletNetwork.PUBLIC : WalletNetwork.TESTNET;
  const kit = useMemo(() => getKit(kitNetwork), [kitNetwork]);

  // Auto-reconnect on mount: try to re-establish the active wallet session.
  // If unavailable, remove it from the list but keep the rest.
  const hasAttemptedReconnect = useRef(false);
  useEffect(() => {
    if (hasAttemptedReconnect.current) return;
    hasAttemptedReconnect.current = true;

    if (!walletType || connected) return;

    let cancelled = false;
    const timeoutId = setTimeout(() => {
      if (!cancelled) {
        console.warn("Auto-reconnect timed out");
        setReconnecting(false);
        disconnect();
      }
    }, AUTO_RECONNECT_TIMEOUT_MS);

    setReconnecting(true);

    (async () => {
      try {
        kit.setWallet(walletType);
        const { address } = await kit.getAddress();
        if (!cancelled) {
          connect(address, walletType);
        }
      } catch (err) {
        console.warn(
          "Auto-reconnect failed — wallet extension may be unavailable:",
          err,
        );
        if (!cancelled) {
          // Clear persisted state so we don't retry on next load
          disconnect();
        }
      } finally {
        clearTimeout(timeoutId);
        if (!cancelled) {
          setReconnecting(false);
        }
      }
    })();

    return () => {
      cancelled = true;
      clearTimeout(timeoutId);
    };
    // Only run on mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const actions = useMemo(
    () => ({
      /** Open the wallet selection modal and add / activate the chosen wallet. */
      connect: async () => {
        setConnecting(true);
        setError(null);
        try {
          await kit.openModal({
            onWalletSelected: async (option) => {
              try {
                kit.setWallet(option.id);
                const { address } = await kit.getAddress();

                // Automatic network detection for better UX
                try {
                  const freighterWindow = window as unknown as {
                    freighter?: Freighter;
                  };
                  if (option.id === FREIGHTER_ID && freighterWindow.freighter) {
                    const networkDetails =
                      await freighterWindow.freighter.getNetwork();
                    const detectedNetwork =
                      networkDetails === "PUBLIC" ? "PUBLIC" : "TESTNET";
                    if (detectedNetwork !== network) {
                      storeSetNetwork(detectedNetwork);
                    }
                  }
                } catch (e) {
                  console.warn("Network auto-detection failed:", e);
                }

                // connect() adds to the list and makes it active
                connect(address, option.id);
              } catch (err) {
                console.error("Wallet connection failed:", err);
                setError(
                  err instanceof Error
                    ? err.message
                    : "Failed to connect wallet",
                );
              }
            },
          });
        } catch {
          setConnecting(false);
        }
      },

      /** Disconnect all wallets. */
      disconnect: () => {
        disconnect();
      },

      /** Remove a specific wallet from the list by public key. */
      removeWallet: (key: string) => {
        removeWallet(key);
      },

      /** Switch the active (default) wallet for signing transactions. */
      setActiveWallet: (key: string) => {
        setActiveWallet(key);
      },

      setNetwork: (newNetwork: "TESTNET" | "PUBLIC") => {
        storeSetNetwork(newNetwork);
      },

      connectWallet: async (walletId: string) => {
        setConnecting(true);
        setError(null);
        try {
          kit.setWallet(walletId);
          const { address } = await kit.getAddress();

          // Automatic network detection for Freighter
          const win = window as unknown as {
            freighter?: { getNetwork: () => Promise<string> };
          };
          if (walletId === "freighter" && win.freighter) {
            try {
              const networkDetails = await win.freighter.getNetwork();
              const detectedNetwork =
                networkDetails === "PUBLIC" ? "PUBLIC" : "TESTNET";
              if (detectedNetwork !== network) {
                storeSetNetwork(detectedNetwork);
              }
            } catch (e) {
              console.warn("Network auto-detection failed:", e);
            }
          }

          connect(address, walletId);
        } catch (err) {
          console.error("Wallet connection failed:", err);
          setError(
            err instanceof Error ? err.message : "Failed to connect wallet",
          );
        } finally {
          setConnecting(false);
        }
      },

      isWalletInstalled,

      signTransaction: async (xdr: string): Promise<string> => {
        if (!publicKey) {
          throw new Error(
            "Please connect your wallet before signing transactions",
          );
        }

        setSigningStatus("signing");
        try {
          const signed = await signTx(xdr, publicKey, kit);
          setSigningStatus("signed");
          return signed;
        } catch (err) {
          setSigningStatus("error");
          const message = err instanceof Error ? err.message : String(err);
          // Normalise rejection/cancellation messages
          if (/cancel|reject|denied|declined|closed/i.test(message)) {
            throw new Error("Transaction rejected by user", { cause: err });
          }
          throw err;
        } finally {
          // Reset to idle after a short delay so consumers can react to the state
          setTimeout(() => setSigningStatus("idle"), 1500);
        }
      },
    }),
    [
      publicKey,
      connect,
      disconnect,
      removeWallet,
      setActiveWallet,
      setConnecting,
      setError,
      storeSetNetwork,
      setSigningStatus,
      kit,
      network,
    ],
  );

  return useMemo(
    () => ({
      /** All currently connected wallets. */
      wallets,
      /** Public key of the active wallet. */
      activeWalletKey,
      publicKey,
      connected,
      connecting,
      isReconnecting,
      error,
      network,
      walletType,
      signingStatus,
      ...actions,
    }),
    [
      wallets,
      activeWalletKey,
      publicKey,
      connected,
      connecting,
      isReconnecting,
      error,
      network,
      walletType,
      signingStatus,
      actions,
    ],
  );
};
