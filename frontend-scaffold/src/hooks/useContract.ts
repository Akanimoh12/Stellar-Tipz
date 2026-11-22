import { useMemo, useCallback, useState } from "react";
// ⚡ TREE-SHAKING OPTIMIZED: Minimal named imports for tree-shaking efficiency
// See docs/BUNDLE_OPTIMIZATION.md for details on reducing Stellar SDK bundle size
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
  prepareTx,
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
  Subscription,
  getCreditTier as calculateCreditTier,
} from "../types/contract";
import { ProfileFormData } from "../types/profile";
import { xlmToStroop } from "../helpers/format";
import { logger } from "../services/logger";
import { useAdminContract } from "./contract/admin";
import { useContractCore } from "./contract/core";
import { useProfileContract } from "./contract/profile";
import { useSubscriptionsContract } from "./contract/subscriptions";
import { useTipsContract } from "./contract/tips";

/**
 * Hook providing typed methods for all Tipz contract operations.
 *
 * The implementation is split by domain under `hooks/contract/`:
 * - `profile.ts`       — profile reads/writes, domains, credit tier
 * - `tips.ts`          — tip reads/writes, min-tip config, streaks
 * - `subscriptions.ts` — create/cancel/execute/read subscriptions
 * - `admin.ts`         — platform stats and leaderboard
 *
 * Every slice shares a single `loading` flag through `useContractCore`,
 * so the public API of this hook is unchanged.
 */
export const useContract = () => {
  const core = useContractCore();

  const profile = useProfileContract(core);
  const tips = useTipsContract(core);
  const subscriptions = useSubscriptionsContract(core);
  const admin = useAdminContract(core);

  // Warn once in development when contract ID is not configured
  if (!core.contractId) {
    logger.warn(
      "[hooks/useContract]",
      "VITE_CONTRACT_ID is not set — contract calls will be skipped.",
    );
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
    [
      contractId,
      wallet.publicKey,
      server,
      networkDetails,
      withLoading,
      withRetry,
    ],
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
    [
      contractId,
      wallet.publicKey,
      server,
      networkDetails,
      withLoading,
      withRetry,
    ],
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
  }, [
    contractId,
    wallet.publicKey,
    server,
    networkDetails,
    withLoading,
    withRetry,
  ]);

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

      const minTipStroops = await withRetry(() =>
        simulateTx<number>(tx, server),
      );
      // Convert stroops to XLM string for display
      return (minTipStroops / 1e7).toString();
    }).catch(() => DEFAULT_MIN_TIP_XLM);
  }, [
    contractId,
    wallet.publicKey,
    server,
    networkDetails,
    withLoading,
    withRetry,
  ]);

  const getCreatorMinTip = useCallback(
    async (creatorAddress: string): Promise<string> => {
      if (!contractId) {
        return getMinTipAmount();
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
          .addOperation(
            contract.call(
              "get_creator_min_tip",
              accountToScVal(creatorAddress),
            ),
          )
          .setTimeout(TimeoutInfinite)
          .build();

        const minTipStroops = await withRetry(() =>
          simulateTx<number>(tx, server),
        );
        return (minTipStroops / 1e7).toString();
      }).catch(() => getMinTipAmount());
    },
    [
      contractId,
      getMinTipAmount,
      wallet.publicKey,
      server,
      networkDetails,
      withLoading,
      withRetry,
    ],
  );

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
    [
      contractId,
      wallet.publicKey,
      server,
      networkDetails,
      withLoading,
      withRetry,
    ],
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
    [
      contractId,
      wallet.publicKey,
      server,
      networkDetails,
      withLoading,
      withRetry,
    ],
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
    [
      contractId,
      wallet.publicKey,
      server,
      networkDetails,
      withLoading,
      withRetry,
    ],
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
    [
      contractId,
      wallet.publicKey,
      server,
      networkDetails,
      withLoading,
      withRetry,
    ],
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
    [
      contractId,
      wallet.publicKey,
      server,
      networkDetails,
      withLoading,
      withRetry,
    ],
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

        const preparedTx = await prepareTx(tx, server);
        const xdr = preparedTx.toXDR();
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

        const preparedTx = await prepareTx(tx, server);
        const xdr_tx = preparedTx.toXDR();
        const signedXdr = await wallet.signTransaction(xdr_tx);
        return submitTx(signedXdr, networkDetails.networkPassphrase, server);
      });
    },
    [contractId, wallet, server, networkDetails, withLoading],
  );

  const setDomain = useCallback(
    async (domain: string): Promise<string> => {
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
              "set_domain",
              accountToScVal(publicKey),
              nativeToScVal(domain.trim().toLowerCase()),
            ),
          )
          .setTimeout(TimeoutInfinite)
          .build();

        const preparedTx = await prepareTx(tx, server);
        const xdr = preparedTx.toXDR();
        const signedXdr = await wallet.signTransaction(xdr);
        return submitTx(signedXdr, networkDetails.networkPassphrase, server);
      });
    },
    [contractId, wallet, server, networkDetails, withLoading],
  );

  const verifyDomain = useCallback(
    async (creator?: string): Promise<string> => {
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
              "verify_domain",
              accountToScVal(publicKey),
              accountToScVal(creator ?? publicKey),
            ),
          )
          .setTimeout(TimeoutInfinite)
          .build();

        const preparedTx = await prepareTx(tx, server);
        const xdr = preparedTx.toXDR();
        const signedXdr = await wallet.signTransaction(xdr);
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
      isEncrypted = false,
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
              nativeToScVal(false, { type: "bool" }),
              nativeToScVal(isEncrypted, { type: "bool" }),
            ),
          )
          .setTimeout(TimeoutInfinite)
          .build();

        const preparedTx = await prepareTx(tx, server);
        const xdr = preparedTx.toXDR();
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

        const preparedTx = await prepareTx(tx, server);
        const xdr = preparedTx.toXDR();
        const signedXdr = await wallet.signTransaction(xdr);
        return submitTx(signedXdr, networkDetails.networkPassphrase, server);
      });
    },
    [contractId, wallet, server, networkDetails, withLoading],
  );

  const deregisterProfile = useCallback(async (): Promise<string> => {
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
          contract.call("deregister_profile", accountToScVal(publicKey)),
        )
        .setTimeout(TimeoutInfinite)
        .build();

      const preparedTx = await prepareTx(tx, server);
      const xdr = preparedTx.toXDR();
      const signedXdr = await wallet.signTransaction(xdr);
      return submitTx(signedXdr, networkDetails.networkPassphrase, server);
    });
  }, [contractId, wallet, server, networkDetails, withLoading]);

  // --- Subscription Methods ---

  const createSubscription = useCallback(
    async (
      creator: string,
      amount: string,
      intervalDays: number,
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

        const stroopAmount = xlmToStroop(amount).toString();

        const tx = txBuilder
          .addOperation(
            contract.call(
              "create_subscription",
              accountToScVal(publicKey),
              accountToScVal(creator),
              numberToI128(safeStringToBigInt(stroopAmount)),
              nativeToScVal(intervalDays, { type: "u32" }),
            ),
          )
          .setTimeout(TimeoutInfinite)
          .build();

        const preparedTx = await prepareTx(tx, server);
        const xdr = preparedTx.toXDR();
        const signedXdr = await wallet.signTransaction(xdr);
        return submitTx(signedXdr, networkDetails.networkPassphrase, server);
      });
    },
    [contractId, wallet, server, networkDetails, withLoading],
  );

  const cancelSubscription = useCallback(
    async (creator: string): Promise<string> => {
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
              "cancel_subscription",
              accountToScVal(publicKey),
              accountToScVal(creator),
            ),
          )
          .setTimeout(TimeoutInfinite)
          .build();

        const preparedTx = await prepareTx(tx, server);
        const xdr = preparedTx.toXDR();
        const signedXdr = await wallet.signTransaction(xdr);
        return submitTx(signedXdr, networkDetails.networkPassphrase, server);
      });
    },
    [contractId, wallet, server, networkDetails, withLoading],
  );

  const executeDueSubscription = useCallback(
    async (creator: string): Promise<string> => {
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
              "execute_due_subscription",
              accountToScVal(publicKey),
              accountToScVal(creator),
            ),
          )
          .setTimeout(TimeoutInfinite)
          .build();

        const preparedTx = await prepareTx(tx, server);
        const xdr = preparedTx.toXDR();
        const signedXdr = await wallet.signTransaction(xdr);
        return submitTx(signedXdr, networkDetails.networkPassphrase, server);
      });
    },
    [contractId, wallet, server, networkDetails, withLoading],
  );

  const getSubscriptions = useCallback(
    async (subscriber: string): Promise<Subscription[]> => {
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
            contract.call("get_subscriptions", accountToScVal(subscriber)),
          )
          .setTimeout(TimeoutInfinite)
          .build();

        return withRetry(() => simulateTx<Subscription[]>(tx, server));
      });
    },
    [
      contractId,
      wallet.publicKey,
      server,
      networkDetails,
      withLoading,
      withRetry,
    ],
  );

  return {
    loading: core.loading,
    ...profile,
    ...tips,
    ...subscriptions,
    ...admin,
  };
};
