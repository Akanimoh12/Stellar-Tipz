import { useCallback } from "react";
import {
  Contract,
  TimeoutInfinite,
  nativeToScVal,
} from "@stellar/stellar-sdk";

import {
  BASE_FEE,
  getSimulationTxBuilder,
  getTxBuilder,
  simulateTx,
} from "../../services";
import { ContractStats, LeaderboardEntry } from "../../types/contract";
import { ContractContext, READ_ONLY_SOURCE } from "./core";

/**
 * Admin/platform domain of the Tipz contract: global stats and the
 * top-creators leaderboard.
 *
 * @param ctx - Shared contract context created by `useContractCore`.
 */
export const useAdminContract = ({
  wallet,
  networkDetails,
  server,
  contractId,
  withLoading,
  withRetry,
}: ContractContext) => {
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

  return {
    getLeaderboard,
    getStats,
  };
};
