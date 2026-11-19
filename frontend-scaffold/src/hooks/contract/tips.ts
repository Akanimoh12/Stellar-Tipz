import { useCallback } from "react";
import {
  Contract,
  TimeoutInfinite,
  nativeToScVal,
  xdr,
} from "@stellar/stellar-sdk";

import {
  accountToScVal,
  BASE_FEE,
  getSimulationTxBuilder,
  getTxBuilder,
  numberToI128,
  simulateTx,
  submitTx,
} from "../../services";
import { Streak, Tip } from "../../types/contract";
import { xlmToStroop } from "../../helpers/format";
import {
  ContractContext,
  READ_ONLY_SOURCE,
  safeStringToBigInt,
} from "./core";

/**
 * Tips domain of the Tipz contract: tip reads, tip counts, min-tip config,
 * streaks, sending tips and withdrawing a creator's balance.
 *
 * @param ctx - Shared contract context created by `useContractCore`.
 */
export const useTipsContract = ({
  wallet,
  networkDetails,
  server,
  contractId,
  withLoading,
  withRetry,
}: ContractContext) => {
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

  const sendTip = useCallback(
    async (
      creator: string,
      amount: string,
      message: string,
      isEncrypted = false,
      expectedMinTip?: bigint,
      expectedFeeBps?: number,
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

        const optionalI128 = (value?: bigint): xdr.ScVal =>
          value === undefined
            ? nativeToScVal({ type: "none" })
            : nativeToScVal({ type: "some", value });
        const optionalU32 = (value?: number): xdr.ScVal =>
          value === undefined
            ? nativeToScVal({ type: "none" })
            : nativeToScVal({ type: "some", value });

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
              optionalI128(expectedMinTip),
              optionalU32(expectedFeeBps),
            ),
          )
          .setTimeout(TimeoutInfinite)
          .build();

        const signedXdr = await wallet.signTransaction(tx.toXDR());
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
    getMinTipAmount,
    getCreatorMinTip,
    getRecentTips,
    getCreatorTipCount,
    getTipsByTipper,
    getTipperTipCount,
    getStreak,
    sendTip,
    withdrawTips,
  };
};
