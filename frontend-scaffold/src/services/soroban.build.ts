/**
 * Transaction-building helpers for Soroban contract interactions.
 *
 * Separated from soroban.ts so that build / submit / fee concerns can be
 * imported independently and tree-shaken when only a subset is needed.
 */

import {
  Account,
  Address,
  Contract,
  Memo,
  MemoType,
  nativeToScVal,
  Operation,
  scValToNative,
  SorobanRpc,
  TimeoutInfinite,
  Transaction,
  TransactionBuilder,
  xdr,
} from "@stellar/stellar-sdk";

import { mapContractResponse } from "../helpers/format";

// ── Primitive converters ───────────────────────────────────────────────────────

/** Convert a Stellar account address string to an ScVal Address argument. */
export const accountToScVal = (account: string) =>
  new Address(account).toScVal();

/** Convert a JS number or bigint to an i128 ScVal for contract calls. */
export const numberToI128 = (value: number | bigint): xdr.ScVal =>
  nativeToScVal(value, { type: "i128" });

// ── TransactionBuilder factories ──────────────────────────────────────────────

/**
 * Build a TransactionBuilder that fetches the source account from the network.
 * Use for write transactions that must set the correct sequence number.
 */
export const getTxBuilder = async (
  pubKey: string,
  fee: string,
  server: SorobanRpc.Server,
  networkPassphrase: string,
): Promise<TransactionBuilder> => {
  const source = await server.getAccount(pubKey);
  return new TransactionBuilder(source, { fee, networkPassphrase });
};

/**
 * Build a TransactionBuilder for simulation-only (read-only) contract calls.
 *
 * Uses an in-memory Account with sequence 0 to avoid a network round-trip.
 * Safe to call when no wallet is connected.
 */
export const getSimulationTxBuilder = (
  pubKey: string,
  fee: string,
  networkPassphrase: string,
): TransactionBuilder => {
  const source = new Account(pubKey, "0");
  return new TransactionBuilder(source, { fee, networkPassphrase });
};

// ── Read-only simulation ──────────────────────────────────────────────────────

/**
 * Simulate a read-only contract call and return the decoded result.
 * Used by getTokenSymbol, getTokenName, getTokenDecimals, getTokenBalance,
 * and getLeaderboard.
 */
export const simulateTx = async <ArgType>(
  tx: Transaction<Memo<MemoType>, Operation[]>,
  server: SorobanRpc.Server,
): Promise<ArgType> => {
  const response = await server.simulateTransaction(tx);

  if (
    SorobanRpc.Api.isSimulationSuccess(response) &&
    response.result !== undefined
  ) {
    const raw = scValToNative(response.result.retval);
    return mapContractResponse<ArgType>(raw);
  }

  throw new Error("cannot simulate transaction");
};

// ── Payment transaction builder ───────────────────────────────────────────────

/**
 * Build and prepare a "transfer" operation XDR ready for wallet signing.
 *
 * Returns the prepared transaction as a base64 XDR string. The caller is
 * responsible for signing it and passing the signed XDR to `submitTx`.
 */
export const makePayment = async (
  tokenId: string,
  amount: number,
  to: string,
  pubKey: string,
  memo: string,
  txBuilder: TransactionBuilder,
  server: SorobanRpc.Server,
): Promise<string> => {
  const contract = new Contract(tokenId);
  const tx = txBuilder
    .addOperation(
      contract.call(
        "transfer",
        accountToScVal(pubKey),
        accountToScVal(to),
        numberToI128(amount),
      ),
    )
    .setTimeout(TimeoutInfinite);

  if (memo.length > 0) {
    tx.addMemo(Memo.text(memo));
  }

  const preparedTransaction = await server.prepareTransaction(tx.build());
  return preparedTransaction.toXDR();
};
