import { useMemo, useCallback } from "react";
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
  getCreditTier as calculateCreditTier,
} from "../types/contract";
import { ProfileFormData } from "../types/profile";
import { xlmToStroop } from "../helpers/format";
import { contractQueryCache, buildContractCacheKey } from "../services/cache";

/**
 * Valid Stellar placeholder address used as the source account for
 * read-only (simulation-only) contract calls when no wallet is connected.
 * This is the well-known zero-account on Stellar.
 */
const READ_ONLY_SOURCE =
  "GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF";

const PROFILE_TTL_MS = 30_000;
const LEADERBOARD_TTL_MS = 60_000;
const PLATFORM_STATS_TTL_MS = 120_000;

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

  // Warn once in development when contract ID is not configured
  if (!contractId) {
    console.warn(
      "[useContract] VITE_CONTRACT_ID is not set — contract calls will be skipped.",
    );
  }

  // --- Read-only Methods ---

  const getProfile = useCallback(
    async (address: string): Promise<Profile> => {
      const key = buildContractCacheKey(
        "get_profile",
        networkDetails.network,
        contractId,
        address,
      );

      return contractQueryCache.getOrFetch<Profile>(
        key,
        PROFILE_TTL_MS,
        async () => {
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

          return simulateTx<Profile>(tx, server);
        },
      );
    },
    [contractId, server, networkDetails],
  );

  const getProfileByUsername = useCallback(
    async (username: string): Promise<Profile> => {
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

      return simulateTx<Profile>(tx, server);
    },
    [contractId, wallet.publicKey, server, networkDetails],
  );

  const getLeaderboard = useCallback(
    async (limit: number): Promise<LeaderboardEntry[]> => {
      const key = buildContractCacheKey(
        "get_leaderboard",
        networkDetails.network,
        contractId,
        limit,
      );

      return contractQueryCache.getOrFetch<LeaderboardEntry[]>(
        key,
        LEADERBOARD_TTL_MS,
        async () => {
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

          return simulateTx<LeaderboardEntry[]>(tx, server);
        },
      );
    },
    [contractId, wallet.publicKey, server, networkDetails],
  );

  const getStats = useCallback(async (): Promise<ContractStats> => {
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

    return simulateTx<ContractStats>(tx, server);
  }, [contractId, wallet.publicKey, server, networkDetails]);

  const getMinTipAmount = useCallback(async (): Promise<string> => {
    const DEFAULT_MIN_TIP_XLM = "1";

    if (!contractId) {
      return DEFAULT_MIN_TIP_XLM;
    }

    try {
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

      const minTipStroops = await simulateTx<number>(tx, server);
      return (minTipStroops / 1e7).toString();
    } catch {
      return DEFAULT_MIN_TIP_XLM;
    }
  }, [contractId, wallet.publicKey, server, networkDetails]);

  const getRecentTips = useCallback(
    async (creator: string, limit: number, offset: number): Promise<Tip[]> => {
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

      return simulateTx<Tip[]>(tx, server);
    },
    [contractId, wallet.publicKey, server, networkDetails],
  );

  const getCreatorTipCount = useCallback(
    async (creator: string): Promise<number> => {
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

      return simulateTx<number>(tx, server);
    },
    [contractId, wallet.publicKey, server, networkDetails],
  );

  const getTipsByTipper = useCallback(
    async (tipper: string, limit: number): Promise<Tip[]> => {
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

      return simulateTx<Tip[]>(tx, server);
    },
    [contractId, wallet.publicKey, server, networkDetails],
  );

  const getTipperTipCount = useCallback(
    async (tipper: string): Promise<number> => {
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

      return simulateTx<number>(tx, server);
    },
    [contractId, wallet.publicKey, server, networkDetails],
  );

  const getCreditTier = useCallback(
    async (address: string) => {
      const profile = await getProfile(address);
      const tier = calculateCreditTier(profile.creditScore);
      return { score: profile.creditScore, tier };
    },
    [getProfile],
  );

  // --- Write Methods ---

  const registerProfile = useCallback(
    async (data: ProfileFormData): Promise<string> => {
      if (!wallet.publicKey) throw new Error("Wallet not connected");

      const contract = new Contract(contractId);
      const txBuilder = await getTxBuilder(
        wallet.publicKey,
        BASE_FEE,
        server,
        networkDetails.networkPassphrase,
      );

      const tx = txBuilder
        .addOperation(
          contract.call(
            "register_profile",
            accountToScVal(wallet.publicKey),
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
      const txHash = await submitTx(
        signedXdr,
        networkDetails.networkPassphrase,
        server,
      );
      contractQueryCache.invalidateAll();
      return txHash;
    },
    [contractId, wallet, server, networkDetails],
  );

  const updateProfile = useCallback(
    async (data: Partial<ProfileFormData>): Promise<string> => {
      if (!wallet.publicKey) throw new Error("Wallet not connected");

      const contract = new Contract(contractId);
      const txBuilder = await getTxBuilder(
        wallet.publicKey,
        BASE_FEE,
        server,
        networkDetails.networkPassphrase,
      );

      const optionalStringToScVal = (value?: string): xdr.ScVal => {
        if (value !== undefined && value !== "") {
          return nativeToScVal({ type: "some", value });
        }

        return nativeToScVal({ type: "none" });
      };

      const tx = txBuilder
        .addOperation(
          contract.call(
            "update_profile",
            accountToScVal(wallet.publicKey),
            optionalStringToScVal(data.displayName),
            optionalStringToScVal(data.bio),
            optionalStringToScVal(data.imageUrl),
            optionalStringToScVal(data.xHandle),
          ),
        )
        .setTimeout(TimeoutInfinite)
        .build();

      const xdrTx = tx.toXDR();
      const signedXdr = await wallet.signTransaction(xdrTx);
      return submitTx(signedXdr, networkDetails.networkPassphrase, server);
    },
    [contractId, wallet, server, networkDetails],
  );

  const sendTip = useCallback(
    async (
      creator: string,
      amount: string,
      message: string,
    ): Promise<string> => {
      if (!wallet.publicKey) throw new Error("Wallet not connected");

      const contract = new Contract(contractId);
      const txBuilder = await getTxBuilder(
        wallet.publicKey,
        BASE_FEE,
        server,
        networkDetails.networkPassphrase,
      );

      const stroopAmount = xlmToStroop(amount).toString();

      const tx = txBuilder
        .addOperation(
          contract.call(
            "send_tip",
            accountToScVal(wallet.publicKey),
            accountToScVal(creator),
            numberToI128(safeStringToBigInt(stroopAmount)),
            nativeToScVal(message),
          ),
        )
        .setTimeout(TimeoutInfinite)
        .build();

      const xdr = tx.toXDR();
      const signedXdr = await wallet.signTransaction(xdr);
      const txHash = await submitTx(
        signedXdr,
        networkDetails.networkPassphrase,
        server,
      );
      contractQueryCache.invalidateAll();
      return txHash;
    },
    [contractId, wallet, server, networkDetails],
  );

  const withdrawTips = useCallback(
    async (amount: string): Promise<string> => {
      if (!wallet.publicKey) throw new Error("Wallet not connected");

      const contract = new Contract(contractId);
      const txBuilder = await getTxBuilder(
        wallet.publicKey,
        BASE_FEE,
        server,
        networkDetails.networkPassphrase,
      );

      const stroopAmount = xlmToStroop(amount).toString();

      const tx = txBuilder
        .addOperation(
          contract.call(
            "withdraw_tips",
            accountToScVal(wallet.publicKey),
            numberToI128(safeStringToBigInt(stroopAmount)),
          ),
        )
        .setTimeout(TimeoutInfinite)
        .build();

      const xdr = tx.toXDR();
      const signedXdr = await wallet.signTransaction(xdr);
      const txHash = await submitTx(
        signedXdr,
        networkDetails.networkPassphrase,
        server,
      );
      contractQueryCache.invalidateAll();
      return txHash;
    },
    [contractId, wallet, server, networkDetails],
  );

  return {
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
    registerProfile,
    updateProfile,
    sendTip,
    withdrawTips,
  };
};
