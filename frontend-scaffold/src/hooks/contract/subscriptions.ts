import { useCallback } from "react";
import {
  Contract,
  TimeoutInfinite,
  nativeToScVal,
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
import { Subscription } from "../../types/contract";
import { xlmToStroop } from "../../helpers/format";
import {
  ContractContext,
  READ_ONLY_SOURCE,
  safeStringToBigInt,
} from "./core";

/**
 * Subscriptions domain of the Tipz contract: creating, cancelling and
 * executing recurring tip subscriptions, plus reading a subscriber's
 * active subscriptions.
 *
 * @param ctx - Shared contract context created by `useContractCore`.
 */
export const useSubscriptionsContract = ({
  wallet,
  networkDetails,
  server,
  contractId,
  withLoading,
  withRetry,
}: ContractContext) => {
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

        const xdr = tx.toXDR();
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

        const xdr = tx.toXDR();
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

        const xdr = tx.toXDR();
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
    createSubscription,
    cancelSubscription,
    executeDueSubscription,
    getSubscriptions,
  };
};
