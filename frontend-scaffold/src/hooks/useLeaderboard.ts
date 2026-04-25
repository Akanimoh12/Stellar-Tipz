import { useState, useEffect, useCallback, useRef } from "react";

import { useContract } from "./useContract";
import { LeaderboardEntry, LeaderboardPeriod } from "../types/contract";
import { env } from "../helpers/env";
import { mockLeaderboard } from "../features/mockData";

const REFETCH_INTERVAL_MS = 60_000; // 60 seconds
const CACHE_KEY = "leaderboard_cache";
const CACHE_DURATION_MS = 5 * 60 * 1000; // 5 minutes

interface CacheData {
  entries: LeaderboardEntry[];
  timestamp: number;
}

export interface LeaderboardData {
  entries: LeaderboardEntry[];
  loading: boolean;
  error: string | null;
  refetch: () => void;
}

/**
 * Fetches leaderboard data from the contract and keeps it fresh.
 */
export const useLeaderboard = (period: LeaderboardPeriod = 'AllTime'): LeaderboardData => {
  const { getLeaderboard } = useContract();

  const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const hasDataRef = useRef(false);
  const isFetchingRef = useRef(false);

  const cacheKey = `${CACHE_KEY}_${period}`;

  /**
   * Load cached data from sessionStorage if available and not expired.
   */
  const loadFromCache = useCallback((): LeaderboardEntry[] | null => {
    try {
      if (env.useMockData) return mockLeaderboard;

      const cached = sessionStorage.getItem(cacheKey);
      if (!cached) return null;

      const parsed = JSON.parse(cached);

      // Validate cache schema
      if (
        !parsed ||
        !Array.isArray(parsed.entries) ||
        typeof parsed.timestamp !== 'number'
      ) {
        sessionStorage.removeItem(cacheKey);
        return null;
      }

      const isExpired = Date.now() - parsed.timestamp > CACHE_DURATION_MS;

      if (isExpired) {
        sessionStorage.removeItem(cacheKey);
        return null;
      }

      return parsed.entries;
    } catch {
      sessionStorage.removeItem(cacheKey);
      return null;
    }
  }, [cacheKey]);

  /**
   * Save data to sessionStorage with current timestamp.
   */
  const saveToCache = useCallback((data: LeaderboardEntry[]): void => {
    try {
      if (env.useMockData) return;
      const cacheData: CacheData = {
        entries: data,
        timestamp: Date.now(),
      };
      sessionStorage.setItem(cacheKey, JSON.stringify(cacheData));
    } catch {
      // Silently fail
    }
  }, [cacheKey]);

  const fetchLeaderboard = useCallback(async () => {
    if (isFetchingRef.current) return;

    // Mock Fallback
    if (env.useMockData) {
      setEntries(mockLeaderboard);
      setLoading(false);
      hasDataRef.current = true;
      return;
    }

    isFetchingRef.current = true;
    if (!hasDataRef.current) {
      setLoading(true);
    }
    setError(null);

    try {
      const fetchedEntries = await getLeaderboard(period, 50);

      setEntries(fetchedEntries);
      hasDataRef.current = true;
      saveToCache(fetchedEntries);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to fetch leaderboard data",
      );
    } finally {
      setLoading(false);
      isFetchingRef.current = false;
    }
  }, [getLeaderboard, period, saveToCache]);

  useEffect(() => {
    const cachedEntries = loadFromCache();

    if (cachedEntries) {
      setEntries(cachedEntries);
      hasDataRef.current = true;
      if (!env.useMockData) {
        fetchLeaderboard();
      }
    } else {
      setEntries([]);
      hasDataRef.current = false;
      fetchLeaderboard();
    }
  }, [period]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (env.useMockData) return;

    const id = setInterval(() => {
      fetchLeaderboard();
    }, REFETCH_INTERVAL_MS);

    return () => clearInterval(id);
  }, [fetchLeaderboard]);

  const refetch = useCallback(() => {
    sessionStorage.removeItem(cacheKey);
    hasDataRef.current = false;
    fetchLeaderboard();
  }, [fetchLeaderboard, cacheKey]);

  return { entries, loading, error, refetch };
};
