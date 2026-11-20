/**
 * Transaction submission helpers for Soroban.
 *
 * Separated from soroban.ts so submitTx can be imported without pulling in
 * the leaderboard / token-query machinery.
 */

import { SorobanRpc, TransactionBuilder } from "@stellar/stellar-sdk";
import { ERRORS } from "../helpers/error";
import { contractQueryCache } from "./cache";

// ── Status map ────────────────────────────────────────────────────────────────

export const SendTxStatus: {
  [index: string]: SorobanRpc.Api.SendTransactionStatus;
} = {
  Pending: "PENDING",
  Duplicate: "DUPLICATE",
  Retry: "TRY_AGAIN_LATER",
  Error: "ERROR",
};

// ── Submission ────────────────────────────────────────────────────────────────

/**
 * Submit a signed transaction XDR to the Soroban RPC and poll until confirmed.
 *
 * Returns the result XDR (base64) on success.
 * Throws if the transaction errors, the timeout is exceeded, or the initial
 * send is rejected.
 *
 * @param signedXDR       Signed transaction in base64 XDR format.
 * @param networkPassphrase  The network passphrase used to decode the XDR.
 * @param server          Soroban RPC server instance.
 * @param timeoutSeconds  Maximum time to wait for confirmation (default 60 s).
 */
export const submitTx = async (
  signedXDR: string,
  networkPassphrase: string,
  server: SorobanRpc.Server,
  timeoutSeconds: number = 60,
): Promise<string> => {
  const tx = TransactionBuilder.fromXDR(signedXDR, networkPassphrase);
  const sendResponse = await server.sendTransaction(tx);

  if (sendResponse.errorResult) {
    throw new Error(ERRORS.UNABLE_TO_SUBMIT_TX);
  }

  if (sendResponse.status === SendTxStatus.Pending) {
    let txResponse = await server.getTransaction(sendResponse.hash);
    const startTime = Date.now();
    const timeoutMs = timeoutSeconds * 1000;

    while (
      txResponse.status === SorobanRpc.Api.GetTransactionStatus.NOT_FOUND
    ) {
      if (Date.now() - startTime > timeoutMs) {
        throw new Error(
          `Transaction polling timeout after ${timeoutSeconds} seconds. Hash: ${sendResponse.hash}`,
        );
      }
      txResponse = await server.getTransaction(sendResponse.hash);
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }

    if (txResponse.status === SorobanRpc.Api.GetTransactionStatus.SUCCESS) {
      // Any write invalidates the balance read cache for both sides of the tx.
      contractQueryCache.invalidateByPrefix('["balance"');
      return txResponse.resultXdr.toXDR("base64");
    }
  }

  throw new Error(
    `Unable to submit transaction, status: ${sendResponse.status}`,
  );
};
