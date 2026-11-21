/**
 * Fee estimation helpers for Soroban transactions.
 *
 * Separated from soroban.ts so fee logic can be imported independently.
 */

import {
  Contract,
  Memo,
  SorobanRpc,
  TimeoutInfinite,
  TransactionBuilder,
} from "@stellar/stellar-sdk";

import { stroopToXlm } from "../helpers/format";
import { accountToScVal, numberToI128 } from "./soroban.build";

// ── Constants ─────────────────────────────────────────────────────────────────

/** Minimum base fee in stroops. */
export const BASE_FEE = "100";

/** Base fee expressed in XLM for display. */
export const baseFeeXlm = stroopToXlm(BASE_FEE).toString();

// ── Fee estimation ────────────────────────────────────────────────────────────

/**
 * Simulate a transfer transaction and return the total estimated fee in
 * stroops (classic fee + minResourceFee).
 *
 * This is a dry-run — no transaction is submitted.
 */
export const getEstimatedFee = async (
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

  const raw = tx.build();
  const simResponse = await server.simulateTransaction(raw);

  if (SorobanRpc.Api.isSimulationError(simResponse)) {
    throw simResponse.error;
  }

  // Classic Soroban transactions have exactly one operation, so total fee is:
  // tx.fee (classic) + minResourceFee (resource reservation).
  const classicFeeNum = BigInt(raw.fee || "0");
  const minResourceFeeNum = BigInt(simResponse.minResourceFee || "0");
  return (classicFeeNum + minResourceFeeNum).toString();
};
