import { useState, useEffect, useCallback, useRef } from 'react';

import { useWalletStore } from '../store/walletStore';
import { useContract } from './useContract';
import { useToastStore } from '../store/toastStore';
import { Profile, ContractStats, Tip } from '../types/contract';
import { categorizeError, ERRORS } from '@/helpers/error';

const REFETCH_INTERVAL_MS = 30_000;

/**
 * Treats a contract error as "user not registered" so polling can pause
 * gracefully rather than spamming failed requests.
 */
const isNotRegisteredError = (err: unknown): boolean => {
  const msg = err instanceof Error ? err.message : String(err);
  return (
    msg.toLowerCase().includes('not found') ||
    msg.toLowerCase().includes('notfound') ||
    msg.toLowerCase().includes('not registered') ||
    msg.toLowerCase().includes('profile not found')
  );
};

export interface DashboardData {
  profile: Profile | null;
  tips: Tip[];
  stats: ContractStats | null;
  loading: boolean;
  error: string | null;
  refetch: () => void;
}

/**
 * Fetches all data required by the dashboard and keeps it fresh.
 *
 * Behaviour:
 * - Only fetches when the wallet is connected and the user is registered.
 * - Polls every 30 seconds for live-ish updates.
 * - Preserves the previous (stale) data while a background refetch is in
 *   progress so the UI never shows an empty state during polling (optimistic UI).
 * - `balance` is available via `profile.balance`.
 * - `feeInfo` is available via `stats.feeBps` and `stats.totalFeesCollected`.
 * - `tips` is stubbed as an empty array until a contract query endpoint is
 *   available (forward-compatible with future contract changes).
 */
export const useDashboard = (): DashboardData => {
  const { publicKey, connected } = useWalletStore();
  const { getProfile, getStats } = useContract();

  const [profile, setProfile] = useState<Profile | null>(null);
  const [tips] = useState<Tip[]>([]);
  const [stats, setStats] = useState<ContractStats | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Refs avoid stale closure issues inside the polling callback.
  const hasDataRef = useRef(false);
  const isFetchingRef = useRef(false);
  // Tracks whether the user is registered so polling stops on unregistered wallets.
  const isRegisteredRef = useRef(true);

  const fetchDashboard = useCallback(async () => {
    if (!publicKey || !connected || isFetchingRef.current || !isRegisteredRef.current) return;

    isFetchingRef.current = true;
    // Only show the full spinner on the very first fetch (no cached data yet).
    if (!hasDataRef.current) {
      setLoading(true);
    }
    setError(null);

    try {
      const { addToast } = useToastStore.getState();

      const [profileResult, statsResult] = await Promise.allSettled([
        getProfile(publicKey),
        getStats(),
      ]);

      if (profileResult.status === 'fulfilled') {
        setProfile(profileResult.value);
        isRegisteredRef.current = true;
      } else {
        const err = profileResult.reason;
        if (isNotRegisteredError(err)) {
          isRegisteredRef.current = false;
          setProfile(null);
          setStats(null);
          hasDataRef.current = false;
        } else {
          setError(err instanceof Error ? err.message : 'Failed to fetch profile');
        }
      }

      if (statsResult.status === 'fulfilled') {
        setStats(statsResult.value);
      } else {
        const err = statsResult.reason;
        console.error('Failed to fetch stats:', err);
        addToast({ 
          message: categorizeError(err) === 'network' ? ERRORS.NETWORK : 'Could not fetch latest platform stats.', 
          type: 'error' 
        });
      }

      if (profileResult.status === 'fulfilled') {
        hasDataRef.current = true;
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch dashboard data');
    } finally {
      setLoading(false);
      isFetchingRef.current = false;
    }
  }, [publicKey, connected, getProfile, getStats]);

  // Initial fetch and cleanup when the connected wallet changes.
  useEffect(() => {
    if (publicKey && connected) {
      // Reset tracking refs whenever the wallet identity changes.
      isRegisteredRef.current = true;
      hasDataRef.current = false;
      setProfile(null);
      setStats(null);
      setError(null);
      fetchDashboard();
    } else {
      setProfile(null);
      setStats(null);
      setError(null);
      hasDataRef.current = false;
      isRegisteredRef.current = true;
    }
  }, [publicKey, connected]); // eslint-disable-line react-hooks/exhaustive-deps

  // Polling interval — 30 s for live-ish updates.
  useEffect(() => {
    if (!publicKey || !connected) return;

    const id = setInterval(() => {
      fetchDashboard();
    }, REFETCH_INTERVAL_MS);

    return () => clearInterval(id);
  }, [publicKey, connected, fetchDashboard]);

  const refetch = useCallback(() => {
    if (publicKey && connected) {
      // Re-enable polling in case it was stopped by a not-registered error.
      isRegisteredRef.current = true;
      fetchDashboard();
    }
  }, [publicKey, connected, fetchDashboard]);

  return { profile, tips, stats, loading, error, refetch };
};
