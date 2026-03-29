import { useMemo } from "react";
import {
  StellarWalletsKit,
  WalletNetwork,
  FREIGHTER_ID,
  FreighterModule,
  AlbedoModule,
  xBullModule,
} from "@creit.tech/stellar-wallets-kit";
import { useWalletStore } from "../store/walletStore";

interface Freighter {
  getNetwork: () => Promise<string>;
  getAddress: () => Promise<string>;
}

let kitInstance: StellarWalletsKit | null = null;
let currentNetwork: WalletNetwork | null = null;

const getKit = (network: WalletNetwork) => {
  if (!kitInstance || currentNetwork !== network) {
    kitInstance = new StellarWalletsKit({
      network,
      selectedWalletId: FREIGHTER_ID,
      modules: [new FreighterModule(), new AlbedoModule(), new xBullModule()],
    });
    currentNetwork = network;
  }
  return kitInstance;
};

export const useWallet = () => {
  const {
    publicKey,
    connected,
    connecting,
    error,
    network,
    connect,
    disconnect,
    setConnecting,
    setError,
    setNetwork: storeSetNetwork,
  } = useWalletStore();

  const kitNetwork =
    network === "PUBLIC" ? WalletNetwork.PUBLIC : WalletNetwork.TESTNET;
  const kit = useMemo(() => getKit(kitNetwork), [kitNetwork]);

  const actions = useMemo(
    () => ({
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
                  // If it's Freighter, check its current network
                  const freighterWindow = window as unknown as { freighter?: Freighter };
                  if (option.id === FREIGHTER_ID && freighterWindow.freighter) {
                    const networkDetails = await freighterWindow.freighter.getNetwork();
                    const detectedNetwork =
                      networkDetails === "PUBLIC" ? "PUBLIC" : "TESTNET";
                    if (detectedNetwork !== network) {
                      storeSetNetwork(detectedNetwork);
                    }
                  }
                } catch (e) {
                  console.warn("Network auto-detection failed:", e);
                }

                connect(address);
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

      disconnect: () => {
        disconnect();
      },

      setNetwork: (newNetwork: "TESTNET" | "PUBLIC") => {
        storeSetNetwork(newNetwork);
      },

      signTransaction: async (xdr: string): Promise<string> => {
        const { signedTxXdr } = await kit.signTransaction(xdr, {
          address: publicKey ?? undefined,
        });
        return signedTxXdr;
      },
    }),
    [
      publicKey,
      connect,
      disconnect,
      setConnecting,
      setError,
      storeSetNetwork,
      kit,
      network,
    ],
  );

  return useMemo(
    () => ({ publicKey, connected, connecting, error, network, ...actions }),
    [publicKey, connected, connecting, error, network, actions]
  );
};
