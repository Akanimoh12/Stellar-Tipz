import { useState, useEffect, useCallback, useRef, useMemo } from "react";

import { useWallet } from "./";
import { LeaderboardEntry } from "../types/contract";
import { env } from "../helpers/env";
import { mockLeaderboard } from "../features/mockData";
import { getNetworkDetails, NetworkDetails } from "../helpers/network";
import { useWalletStore } from "../store/walletStore";
import {
  getServer,
  getLeaderboard,
  mergeLeaderboardEntries,
  invalidateLeaderboardCache,
  LEADERBOARD_CACHE_TTL_MS,
  type LeaderboardFetchContext,
} from "../services/soroban";

const READ_ONLY_SOURCE =
  "GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF";

export interface LeaderboardData {
  entries: LeaderboardEntry[];
  loading: boolean;
  error: string | null;
  /** @deprecated Pagination is now handled by LeaderboardTable. Always false. */
  hasMore: boolean;
  /** @deprecated Pagination is now handled by LeaderboardTable. No-op. */
  loadMore: () => void;
  refetch: () => void;
}

/**
 * Fetches the full leaderboard in a single RPC batch with TTL caching and
 * background refresh. Client-side pagination is delegated to LeaderboardTable.
 */
export const useLeaderboard = (): LeaderboardData => {
  const wallet = useWallet();
  const { network } = useWalletStore();

  const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fullBatchRef = useRef<LeaderboardEntry[]>([]);
  const isFetchingRef = useRef(false);
  const hasDataRef = useRef(false);

  const networkDetails: NetworkDetails = useMemo(() => getNetworkDetails(network), [network]);

  const buildFetchContext = useCallback((): LeaderboardFetchContext => {
    const server = getServer(networkDetails);
    return {
      contractId: env.contractId,
      network: networkDetails.network,
      networkPassphrase: networkDetails.networkPassphrase,
      sourcePublicKey: wallet.publicKey ?? READ_ONLY_SOURCE,
      server,
    };
  }, [network, networkDetails.network, networkDetails.networkPassphrase, wallet.publicKey]);

  const fetchLeaderboard = useCallback(
    async (options?: { background?: boolean; reset?: boolean }) => {
      if (isFetchingRef.current) {
        return;
      }

      if (env.useMockData) {
        fullBatchRef.current = mockLeaderboard;
        setEntries(mockLeaderboard);
        setLoading(false);
        setError(null);
        return;
      }

      if (!env.contractId) {
        setEntries([]);
        setLoading(false);
        setError("Contract ID is not configured");
        return;
      }

      isFetchingRef.current = true;
      const shouldReset = options?.reset ?? !options?.background;

      if (!options?.background && !hasDataRef.current) {
        setLoading(true);
      }
      setError(null);

      try {
        const batch = await getLeaderboard(buildFetchContext(), 0);
        const merged = shouldReset
          ? batch
          : mergeLeaderboardEntries(fullBatchRef.current, batch);

        fullBatchRef.current = merged;
        setEntries(merged);
        hasDataRef.current = true;
      } catch (err) {
        setError(
          err instanceof Error
            ? err.message
            : "Failed to fetch leaderboard data",
        );
      } finally {
        setLoading(false);
        isFetchingRef.current = false;
      }
    },
    [buildFetchContext],
  );

  useEffect(() => {
    void fetchLeaderboard({ reset: true });
  }, [fetchLeaderboard]);

  useEffect(() => {
    if (env.useMockData) {
      return;
    }

    const intervalId = setInterval(() => {
      void fetchLeaderboard({ background: true, reset: false });
    }, LEADERBOARD_CACHE_TTL_MS);

    return () => {
      clearInterval(intervalId);
    };
  }, [fetchLeaderboard]);

  const loadMore = useCallback(() => {
    // No-op: pagination is now handled entirely by LeaderboardTable.
  }, []);

  const refetch = useCallback(() => {
    invalidateLeaderboardCache();
    hasDataRef.current = false;
    void fetchLeaderboard({ reset: true });
  }, [fetchLeaderboard]);

  return { entries, loading, error, hasMore: false, loadMore, refetch };
};
