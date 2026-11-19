import { useCallback, useMemo, useState } from "react";

import { env } from "../../helpers/env";
import { getNetworkDetails, NetworkDetails } from "../../helpers/network";
import { getServer } from "../../services";
import { useWalletStore } from "../../store/walletStore";
import { useWallet } from "../";

/**
 * Valid Stellar placeholder address used as the source account for
 * read-only (simulation-only) contract calls when no wallet is connected.
 * This is the well-known zero-account on Stellar.
 */
export const READ_ONLY_SOURCE =
  "GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF";

/**
 * Safely converts a numeric string to a BigInt.
 * Validates that the input is a non-empty string of digits.
 * @param amount The string to convert.
 * @returns The converted BigInt.
 * @throws Error if the amount format is invalid.
 */
export function safeStringToBigInt(amount: string): bigint {
  if (!amount || !/^\d+$/.test(amount)) {
    throw new Error("Invalid amount format");
  }
  return BigInt(amount);
}

/**
 * Shared execution context handed to every domain slice of `useContract`
 * (`profile`, `tips`, `subscriptions`, `admin`).
 *
 * Built once per `useContract()` call by {@link useContractCore} so all
 * slices observe the same wallet, network, Horizon server and `loading`
 * flag.
 */
export interface ContractContext {
  wallet: ReturnType<typeof useWallet>;
  networkDetails: NetworkDetails;
  server: ReturnType<typeof getServer>;
  contractId: string;
  loading: boolean;
  withLoading: <T>(operation: () => Promise<T>) => Promise<T>;
  withRetry: <T>(operation: () => Promise<T>, attempts?: number) => Promise<T>;
}

/**
 * Creates the shared wallet/network/server context plus the `loading`
 * flag and the `withLoading` / `withRetry` wrappers used by every
 * contract domain slice.
 */
export const useContractCore = (): ContractContext => {
  const wallet = useWallet();
  const { network } = useWalletStore();
  const [loading, setLoading] = useState(false);

  const networkDetails: NetworkDetails = useMemo(
    () => getNetworkDetails(network),
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

  const withRetry = useCallback(
    async <T>(operation: () => Promise<T>, attempts = 2): Promise<T> => {
      let lastError: unknown;
      for (let attempt = 0; attempt < attempts; attempt += 1) {
        try {
          return await operation();
        } catch (error) {
          lastError = error;
        }
      }
      throw lastError instanceof Error
        ? lastError
        : new Error(String(lastError));
    },
    [],
  );

  return {
    wallet,
    networkDetails,
    server,
    contractId,
    loading,
    withLoading,
    withRetry,
  };
};
