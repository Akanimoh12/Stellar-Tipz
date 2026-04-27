import { useMemo, useCallback, useState } from "react";
import {
  Contract,
  TimeoutInfinite,
  nativeToScVal,
  xdr,
} from "@stellar/stellar-sdk";

import { useWallet } from "./";
import { env } from "../helpers/env";
import {
  getServer,
  getTxBuilder,
  getSimulationTxBuilder,
  simulateTx,
  submitTx,
  accountToScVal,
  numberToI128,
  BASE_FEE,
} from "../services";
import { NetworkDetails } from "../helpers/network";
import { useWalletStore } from "../store/walletStore";
import {
  Profile,
  Tip,
  LeaderboardEntry,
  ContractStats,
  Streak,
  getCreditTier as calculateCreditTier,
} from "../types/contract";
import { ProfileFormData } from "../types/profile";
import { xlmToStroop } from "../helpers/format";

/**
 * Valid Stellar placeholder address used as the source account for
 * read-only (simulation-only) contract calls when no wallet is connected.
 * This is the well-known zero-account on Stellar.
 */
const READ_ONLY_SOURCE =
  "GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF";

/**
 * Safely converts a numeric string to a BigInt.
 * Validates that the input is a non-empty string of digits.
 * @param amount The string to convert.
 * @returns The converted BigInt.
 * @throws Error if the amount format is invalid.
 */
function safeStringToBigInt(amount: string): bigint {
  if (!amount || !/^\d+$/.test(amount)) {
    throw new Error("Invalid amount format");
  }
  return BigInt(amount);
}

/**
 * Hook providing typed methods for all Tipz contract operations.
 */
export const useContract = () => {
  const wallet = useWallet();
  const { network } = useWalletStore();
  const [loading, setLoading] = useState(false);

  const networkDetails: NetworkDetails = useMemo(
    () => ({
      network,
      networkUrl:
        network === "TESTNET" ? env.horizonUrl : "https://horizon.stellar.org",
      networkPassphrase:
        network === "TESTNET"
          ? "Test SDF Network ; September 2015"
          : "Public Global Stellar Network ; September 2015",
    }),
    [network],
  );

  const server = useMemo(() => getServer(networkDetails), [networkDetails]);
  const contractId = env.contractId;

  const withLoading = useCallback(
    async <T>(operation: () => Promise<T>): Promise<T> => {
      setLoading(true);
      try {
        return await operation();
      } finally {
        setLoading(false);
      }
    },
    [],
  );

  const withRetry = useCallback(async <T,>(
    operation: () => Promise<T>,
    attempts = 2,
  ): Promise<T> => {
    let lastError: unknown;
    for (let attempt = 0; attempt < attempts; attempt += 1) {
      try {
        return await operation();
      } catch (error) {
        lastError = error;
      }
    }
    throw lastError instanceof Error ? lastError : new Error(String(lastError));
  }, []);

  // Warn once in development when contract ID is not configured
  if (!contractId) {
    console.warn("[useContract] VITE_CONTRACT_ID is not set — contract calls will be skipped.");
  }

  // --- Read-only Methods ---

  const getProfile = useCallback(
    async (address: string): Promise<Profile> => {
      return withLoading(async () => {
        const contract = new Contract(contractId);
        const txBuilder = getSimulationTxBuilder(
          address,
          BASE_FEE,
          networkDetails.networkPassphrase,
        );
        const tx = txBuilder
          .addOperation(contract.call("get_profile", accountToScVal(address)))
          .setTimeout(TimeoutInfinite)
          .build();

        return withRetry(() => simulateTx<Profile>(tx, server));
      });
    },
    [contractId, server, networkDetails, withLoading, withRetry],
  );

  const getProfileByUsername = useCallback(
    async (username: string): Promise<Profile> => {
      return withLoading(async () => {
        const contract = new Contract(contractId);
        const txBuilder = wallet.publicKey
          ? await getTxBuilder(
              wallet.publicKey,
              BASE_FEE,
              server,
              networkDetails.networkPassphrase,
            )
          : getSimulationTxBuilder(
              READ_ONLY_SOURCE,
              BASE_FEE,
              networkDetails.networkPassphrase,
            );
        const tx = txBuilder
          .addOperation(
            contract.call("get_profile_by_username", nativeToScVal(username)),
          )
          .setTimeout(TimeoutInfinite)
          .build();

        return withRetry(() => simulateTx<Profile>(tx, server));
      });
    },
    [contractId, wallet.publicKey, server, networkDetails, withLoading, withRetry],
  );

  const getLeaderboard = useCallback(
    async (limit: number): Promise<LeaderboardEntry[]> => {
      return withLoading(async () => {
        const contract = new Contract(contractId);
        const txBuilder = wallet.publicKey
          ? await getTxBuilder(
              wallet.publicKey,
              BASE_FEE,
              server,
              networkDetails.networkPassphrase,
            )
          : getSimulationTxBuilder(
              READ_ONLY_SOURCE,
              BASE_FEE,
              networkDetails.networkPassphrase,
            );
        const tx = txBuilder
          .addOperation(
            contract.call(
              "get_leaderboard",
              nativeToScVal(limit, { type: "u32" }),
            ),
          )
          .setTimeout(TimeoutInfinite)
          .build();

        return withRetry(() => simulateTx<LeaderboardEntry[]>(tx, server));
      });
    },
    [contractId, wallet.publicKey, server, networkDetails, withLoading, withRetry],
  );

  const getStats = useCallback(async (): Promise<ContractStats> => {
    return withLoading(async () => {
      if (!contractId) {
        throw new Error("Contract ID is not configured");
      }
      const contract = new Contract(contractId);
      const txBuilder = wallet.publicKey
        ? await getTxBuilder(
            wallet.publicKey,
            BASE_FEE,
            server,
            networkDetails.networkPassphrase,
          )
        : getSimulationTxBuilder(
            READ_ONLY_SOURCE,
            BASE_FEE,
            networkDetails.networkPassphrase,
          );
      const tx = txBuilder
        .addOperation(contract.call("get_stats"))
        .setTimeout(TimeoutInfinite)
        .build();

      return withRetry(() => simulateTx<ContractStats>(tx, server));
    });
  }, [contractId, wallet.publicKey, server, networkDetails, withLoading, withRetry]);

  const getMinTipAmount = useCallback(async (): Promise<string> => {
    // Default of 1 XLM returned when contract is unavailable or not yet deployed
    const DEFAULT_MIN_TIP_XLM = "1";

    if (!contractId) {
      return DEFAULT_MIN_TIP_XLM;
    }

    return withLoading(async () => {
      const contract = new Contract(contractId);
      const txBuilder = wallet.publicKey
        ? await getTxBuilder(
            wallet.publicKey,
            BASE_FEE,
            server,
            networkDetails.networkPassphrase,
          )
        : getSimulationTxBuilder(
            READ_ONLY_SOURCE,
            BASE_FEE,
            networkDetails.networkPassphrase,
          );
      const tx = txBuilder
        .addOperation(contract.call("get_min_tip_amount"))
        .setTimeout(TimeoutInfinite)
        .build();

      const minTipStroops = await withRetry(() => simulateTx<number>(tx, server));
      // Convert stroops to XLM string for display
      return (minTipStroops / 1e7).toString();
    }).catch(() => DEFAULT_MIN_TIP_XLM);
  }, [contractId, wallet.publicKey, server, networkDetails, withLoading, withRetry]);

  const getRecentTips = useCallback(
    async (creator: string, limit: number, offset: number): Promise<Tip[]> => {
      return withLoading(async () => {
        const contract = new Contract(contractId);
        const txBuilder = wallet.publicKey
          ? await getTxBuilder(
              wallet.publicKey,
              BASE_FEE,
              server,
              networkDetails.networkPassphrase,
            )
          : getSimulationTxBuilder(
              READ_ONLY_SOURCE,
              BASE_FEE,
              networkDetails.networkPassphrase,
            );
        const tx = txBuilder
          .addOperation(
            contract.call(
              "get_recent_tips",
              accountToScVal(creator),
              nativeToScVal(limit, { type: "u32" }),
              nativeToScVal(offset, { type: "u32" }),
            ),
          )
          .setTimeout(TimeoutInfinite)
          .build();

        return withRetry(() => simulateTx<Tip[]>(tx, server));
      });
    },
    [contractId, wallet.publicKey, server, networkDetails, withLoading, withRetry],
  );

  const getCreatorTipCount = useCallback(
    async (creator: string): Promise<number> => {
      return withLoading(async () => {
        const contract = new Contract(contractId);
        const txBuilder = wallet.publicKey
          ? await getTxBuilder(
              wallet.publicKey,
              BASE_FEE,
              server,
              networkDetails.networkPassphrase,
            )
          : getSimulationTxBuilder(
              READ_ONLY_SOURCE,
              BASE_FEE,
              networkDetails.networkPassphrase,
            );
        const tx = txBuilder
          .addOperation(
            contract.call("get_creator_tip_count", accountToScVal(creator)),
          )
          .setTimeout(TimeoutInfinite)
          .build();

        return withRetry(() => simulateTx<number>(tx, server));
      });
    },
    [contractId, wallet.publicKey, server, networkDetails, withLoading, withRetry],
  );

  const getTipsByTipper = useCallback(
    async (tipper: string, limit: number): Promise<Tip[]> => {
      return withLoading(async () => {
        const contract = new Contract(contractId);
        const txBuilder = wallet.publicKey
          ? await getTxBuilder(
              wallet.publicKey,
              BASE_FEE,
              server,
              networkDetails.networkPassphrase,
            )
          : getSimulationTxBuilder(
              READ_ONLY_SOURCE,
              BASE_FEE,
              networkDetails.networkPassphrase,
            );
        const tx = txBuilder
          .addOperation(
            contract.call(
              "get_tips_by_tipper",
              accountToScVal(tipper),
              nativeToScVal(limit, { type: "u32" }),
            ),
          )
          .setTimeout(TimeoutInfinite)
          .build();

        return withRetry(() => simulateTx<Tip[]>(tx, server));
      });
    },
    [contractId, wallet.publicKey, server, networkDetails, withLoading, withRetry],
  );

  const getTipperTipCount = useCallback(
    async (tipper: string): Promise<number> => {
      return withLoading(async () => {
        const contract = new Contract(contractId);
        const txBuilder = wallet.publicKey
          ? await getTxBuilder(
              wallet.publicKey,
              BASE_FEE,
              server,
              networkDetails.networkPassphrase,
            )
          : getSimulationTxBuilder(
              READ_ONLY_SOURCE,
              BASE_FEE,
              networkDetails.networkPassphrase,
            );
        const tx = txBuilder
          .addOperation(
            contract.call("get_tipper_tip_count", accountToScVal(tipper)),
          )
          .setTimeout(TimeoutInfinite)
          .build();

        return withRetry(() => simulateTx<number>(tx, server));
      });
    },
    [contractId, wallet.publicKey, server, networkDetails, withLoading, withRetry],
  );

  const getCreditTier = useCallback(
    async (address: string) => {
      return withLoading(async () => {
        const profile = await getProfile(address);
        const tier = calculateCreditTier(profile.creditScore);
        return { score: profile.creditScore, tier };
      });
    },
    [getProfile, withLoading],
  );

  const getStreak = useCallback(
    async (supporter: string, creator: string): Promise<Streak> => {
      return withLoading(async () => {
        const contract = new Contract(contractId);
        const txBuilder = wallet.publicKey
          ? await getTxBuilder(
              wallet.publicKey,
              BASE_FEE,
              server,
              networkDetails.networkPassphrase,
            )
          : getSimulationTxBuilder(
              READ_ONLY_SOURCE,
              BASE_FEE,
              networkDetails.networkPassphrase,
            );
        const tx = txBuilder
          .addOperation(
            contract.call(
              "get_streak",
              accountToScVal(supporter),
              accountToScVal(creator),
            ),
          )
          .setTimeout(TimeoutInfinite)
          .build();

        return withRetry(() => simulateTx<Streak>(tx, server));
      });
    },
    [contractId, wallet.publicKey, server, networkDetails, withLoading, withRetry],
  );

  // --- Write Methods ---

  const registerProfile = useCallback(
    async (data: ProfileFormData): Promise<string> => {
      const publicKey = wallet.publicKey;
      if (!publicKey) throw new Error("Wallet not connected");

      return withLoading(async () => {
        const contract = new Contract(contractId);
        const txBuilder = await getTxBuilder(
          publicKey,
          BASE_FEE,
          server,
          networkDetails.networkPassphrase,
        );

        const tx = txBuilder
          .addOperation(
            contract.call(
              "register_profile",
              accountToScVal(publicKey),
              nativeToScVal(data.username),
              nativeToScVal(data.displayName),
              nativeToScVal(data.bio),
              nativeToScVal(data.imageUrl),
              nativeToScVal(data.xHandle),
            ),
          )
          .setTimeout(TimeoutInfinite)
          .build();

        const xdr = tx.toXDR();
        const signedXdr = await wallet.signTransaction(xdr);
        return submitTx(signedXdr, networkDetails.networkPassphrase, server);
      });
    },
    [contractId, wallet, server, networkDetails, withLoading],
  );

  const updateProfile = useCallback(
    async (data: Partial<ProfileFormData>): Promise<string> => {
      const publicKey = wallet.publicKey;
      if (!publicKey) throw new Error("Wallet not connected");

      return withLoading(async () => {
        const contract = new Contract(contractId);
        const txBuilder = await getTxBuilder(
          publicKey,
          BASE_FEE,
          server,
          networkDetails.networkPassphrase,
        );

        // Helper function to convert optional string to ScVal
        // Returns an Option with Some(value) if value is provided, else None
        const optionalStringToScVal = (value?: string): xdr.ScVal => {
          if (value !== undefined && value !== "") {
            return nativeToScVal({ type: "some", value: value });
          }
          return nativeToScVal({ type: "none" });
        };

        const tx = txBuilder
          .addOperation(
            contract.call(
              "update_profile",
              accountToScVal(publicKey),
              optionalStringToScVal(data.displayName),
              optionalStringToScVal(data.bio),
              optionalStringToScVal(data.imageUrl),
              optionalStringToScVal(data.xHandle),
            ),
          )
          .setTimeout(TimeoutInfinite)
          .build();

        const xdr_tx = tx.toXDR();
        const signedXdr = await wallet.signTransaction(xdr_tx);
        return submitTx(signedXdr, networkDetails.networkPassphrase, server);
      });
    },
    [contractId, wallet, server, networkDetails, withLoading],
  );

  const sendTip = useCallback(
    async (
      creator: string,
      amount: string,
      message: string,
    ): Promise<string> => {
      const publicKey = wallet.publicKey;
      if (!publicKey) throw new Error("Wallet not connected");

      return withLoading(async () => {
        const contract = new Contract(contractId);
        const txBuilder = await getTxBuilder(
          publicKey,
          BASE_FEE,
          server,
          networkDetails.networkPassphrase,
        );

        // Convert XLM amount to stroops before sending to contract
        const stroopAmount = xlmToStroop(amount).toString();

        const tx = txBuilder
          .addOperation(
            contract.call(
              "send_tip",
              accountToScVal(publicKey),
              accountToScVal(creator),
              numberToI128(safeStringToBigInt(stroopAmount)),
              nativeToScVal(message),
            ),
          )
          .setTimeout(TimeoutInfinite)
          .build();

        const xdr = tx.toXDR();
        const signedXdr = await wallet.signTransaction(xdr);
        return submitTx(signedXdr, networkDetails.networkPassphrase, server);
      });
    },
    [contractId, wallet, server, networkDetails, withLoading],
  );

  const withdrawTips = useCallback(
    async (amount: string): Promise<string> => {
      const publicKey = wallet.publicKey;
      if (!publicKey) throw new Error("Wallet not connected");

      return withLoading(async () => {
        const contract = new Contract(contractId);
        const txBuilder = await getTxBuilder(
          publicKey,
          BASE_FEE,
          server,
          networkDetails.networkPassphrase,
        );

        // Convert XLM amount to stroops before sending to contract
        const stroopAmount = xlmToStroop(amount).toString();

        const tx = txBuilder
          .addOperation(
            contract.call(
              "withdraw_tips",
              accountToScVal(publicKey),
              numberToI128(safeStringToBigInt(stroopAmount)),
            ),
          )
          .setTimeout(TimeoutInfinite)
          .build();

        const xdr = tx.toXDR();
        const signedXdr = await wallet.signTransaction(xdr);
        return submitTx(signedXdr, networkDetails.networkPassphrase, server);
      });
    },
    [contractId, wallet, server, networkDetails, withLoading],
  );

  return {
    loading,
    getProfile,
    getProfileByUsername,
    getLeaderboard,
    getStats,
    getMinTipAmount,
    getRecentTips,
    getCreatorTipCount,
    getTipsByTipper,
    getTipperTipCount,
    getCreditTier,
    getStreak,
    registerProfile,
    updateProfile,
    sendTip,
    withdrawTips,
  };
};
