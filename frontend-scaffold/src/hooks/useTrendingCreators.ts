import { useState, useEffect, useCallback, useRef } from "react";
import { useContract } from "./useContract";
import { LeaderboardEntry, Tip } from "../types/contract";
import { env } from "../helpers/env";
import { logger } from '../services/logger';

const CACHE_DURATION_MS = 5 * 60 * 1000; // 5 minutes
const SEVEN_DAYS_SECONDS = 7 * 24 * 60 * 60;

interface TrendingCreator extends LeaderboardEntry {
  weeklyTips: string; // stroops as string
}

interface CacheEntry {
  data: TrendingCreator[];
  timestamp: number;
}

let cache: CacheEntry | null = null;

/**
 * Aggregates tips by creator for the last 7 days.
 * Returns a map of creator address -> total weekly tips in stroops.
 */
function aggregateWeeklyTips(
  tips: Tip[],
  cutoffTimestamp: number,
): Map<string, bigint> {
  const weeklyTotals = new Map<string, bigint>();

  for (const tip of tips) {
    if (tip.timestamp >= cutoffTimestamp) {
      const current = weeklyTotals.get(tip.creator) ?? BigInt(0);
      weeklyTotals.set(tip.creator, current + BigInt(tip.amount));
    }
  }

  return weeklyTotals;
}

/**
 * Hook that fetches trending creators (most tips in last 7 days).
 * Falls back to overall leaderboard if no recent data.
 * Caches results for 5 minutes.
 */
export function useTrendingCreators(limit = 10) {
  const [creators, setCreators] = useState<TrendingCreator[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isFallback, setIsFallback] = useState(false);

  const { getLeaderboard, getRecentTips } = useContract();
  const isFetchingRef = useRef(false);

  const fetchTrending = useCallback(async () => {
    // Check cache first
    if (cache && Date.now() - cache.timestamp < CACHE_DURATION_MS) {
      setCreators(cache.data.slice(0, limit));
      setLoading(false);
      setIsFallback(false);
      return;
    }

    if (isFetchingRef.current) return;
    isFetchingRef.current = true;
    setLoading(true);
    setError(null);

    try {
      // No contract configured: there is no leaderboard to rank.
      if (!env.contractId) {
        setCreators([]);
        setIsFallback(false);
        setLoading(false);
        isFetchingRef.current = false;
        return;
      }

      // Fetch leaderboard entries
      const leaderboard = await getLeaderboard(50); // Fetch more to have a pool

      if (leaderboard.length === 0) {
        setCreators([]);
        setIsFallback(false);
        setLoading(false);
        isFetchingRef.current = false;
        return;
      }

      // Fetch recent tips for each creator to calculate weekly totals
      const cutoffTimestamp =
        Math.floor(Date.now() / 1000) - SEVEN_DAYS_SECONDS;
      const allTips: Tip[] = [];

      // Fetch tips for top creators (limit to avoid too many requests)
      const topCreators = leaderboard.slice(0, 20);
      const tipPromises = topCreators.map((creator) =>
        getRecentTips(creator.address, 100, 0).catch((err) => {
          logger.warn('hooks/useTrendingCreators', 'getRecentTips failed for creator', { address: creator.address }, err instanceof Error ? err : new Error(String(err)));
          return [] as Tip[];
        }),
      );

      const tipResults = await Promise.all(tipPromises);
      tipResults.forEach((tips) => allTips.push(...tips));

      // Aggregate weekly tips
      const weeklyTotals = aggregateWeeklyTips(allTips, cutoffTimestamp);

      // Build trending list with weekly amounts
      const trending: TrendingCreator[] = leaderboard
        .map((entry) => ({
          ...entry,
          weeklyTips: (weeklyTotals.get(entry.address) ?? BigInt(0)).toString(),
        }))
        .filter((entry) => BigInt(entry.weeklyTips) > BigInt(0))
        .sort((a, b) => {
          const diff = BigInt(b.weeklyTips) - BigInt(a.weeklyTips);
          return diff > BigInt(0) ? 1 : diff < BigInt(0) ? -1 : 0;
        })
        .slice(0, limit);

      // Fallback to overall leaderboard if no recent activity
      if (trending.length === 0) {
        const fallback: TrendingCreator[] = leaderboard
          .slice(0, limit)
          .map((entry) => ({
            ...entry,
            weeklyTips: "0",
          }));
        setCreators(fallback);
        setIsFallback(true);
      } else {
        setCreators(trending);
        setIsFallback(false);
        // Cache the result
        cache = { data: trending, timestamp: Date.now() };
      }
    } catch (err) {
      logger.error('hooks/useTrendingCreators', 'Failed to fetch trending creators', undefined, err instanceof Error ? err : new Error(String(err)));
      setError(
        err instanceof Error ? err.message : "Failed to load trending creators",
      );

      // Fallback to overall leaderboard on error
      try {
        const fallback = await getLeaderboard(limit);
        const fallbackTrending: TrendingCreator[] = fallback.map((entry) => ({
          ...entry,
          weeklyTips: "0",
        }));
        setCreators(fallbackTrending);
        setIsFallback(true);
      } catch {
        setCreators([]);
      }
    } finally {
      setLoading(false);
      isFetchingRef.current = false;
    }
  }, [limit, getLeaderboard, getRecentTips]);

  useEffect(() => {
    fetchTrending();
  }, [fetchTrending]);

  return { creators, loading, error, isFallback, refetch: fetchTrending };
}
