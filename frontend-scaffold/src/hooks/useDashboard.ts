import { useState, useEffect, useCallback, useRef } from 'react';

import { useWalletStore } from '../store/walletStore';
import { useContract } from './useContract';
import { useToastStore } from '../store/toastStore';
import { Profile, ContractStats, Tip } from '../types/contract';
import { categorizeError, ERRORS } from '@/helpers/error';
import { logger } from '../services/logger';

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
  applyOptimisticWithdrawal: (amountStroops: string) => void;
  revertOptimisticWithdrawal: () => void;
}

/**
 * Fetches all data required by the dashboard and keeps it fresh.
 */
export const useDashboard = (): DashboardData => {
  const { publicKey, connected } = useWalletStore();
  const { getProfile, getStats, getRecentTips } = useContract();

  const [profile, setProfile] = useState<Profile | null>(null);
  const [tips, setTips] = useState<Tip[]>([]);
  const [stats, setStats] = useState<ContractStats | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const hasDataRef = useRef(false);
  const isFetchingRef = useRef(false);
  const isRegisteredRef = useRef(true);
  const optimisticBalanceRef = useRef<string | null>(null);

  const applyOptimisticWithdrawal = useCallback(
    (amountStroops: string) => {
      setProfile((prev) => {
        if (!prev) return prev;
        if (!/^\d+$/.test(amountStroops)) return prev;

        if (optimisticBalanceRef.current === null) {
          optimisticBalanceRef.current = prev.balance;
        }

        const nextBalance = (
          BigInt(prev.balance || "0") - BigInt(amountStroops)
        ).toString();

        return {
          ...prev,
          balance: BigInt(nextBalance) < 0n ? "0" : nextBalance,
        };
      });
    },
    [setProfile],
  );

  const revertOptimisticWithdrawal = useCallback(() => {
    const previous = optimisticBalanceRef.current;
    if (!previous) return;
    optimisticBalanceRef.current = null;
    setProfile((prev) => (prev ? { ...prev, balance: previous } : prev));
  }, [setProfile]);

  const fetchDashboard = useCallback(async () => {
    if (!publicKey || !connected || isFetchingRef.current || !isRegisteredRef.current) return;

    isFetchingRef.current = true;
    if (!hasDataRef.current) {
      setLoading(true);
    }
    setError(null);

    try {
      const { addToast } = useToastStore.getState();

      const [profileResult, statsResult, tipsResult] = await Promise.allSettled([
        getProfile(publicKey),
        getStats(),
        getRecentTips(publicKey, 10, 0),
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
          setTips([]);
          hasDataRef.current = false;
        } else {
          setError(err instanceof Error ? err.message : 'Failed to fetch profile');
        }
      }

      if (statsResult.status === 'fulfilled') {
        setStats(statsResult.value);
      } else if (statsResult.status === 'rejected') {
        const err = statsResult.reason;
        logger.error('hooks/useDashboard', 'Failed to fetch stats', undefined, err instanceof Error ? err : new Error(String(err)));
        addToast({ 
          message: categorizeError(err).category === 'network' ? ERRORS.NETWORK : 'Could not fetch latest platform stats.', 
          type: 'error' 
        });
      }

      if (tipsResult.status === 'fulfilled') {
        setTips(tipsResult.value);
      } else if (tipsResult.status === 'rejected') {
        logger.error('hooks/useDashboard', 'Failed to fetch tips', undefined, tipsResult.reason instanceof Error ? tipsResult.reason : new Error(String(tipsResult.reason)));
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
  }, [publicKey, connected, getProfile, getStats, getRecentTips]);

  useEffect(() => {
    if (publicKey && connected) {
      isRegisteredRef.current = true;
      hasDataRef.current = false;
      setProfile(null);
      setStats(null);
      setTips([]);
      setError(null);
      fetchDashboard();
    } else {
      setProfile(null);
      setStats(null);
      setTips([]);
      setError(null);
      hasDataRef.current = false;
      isRegisteredRef.current = true;
    }
  }, [publicKey, connected]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!publicKey || !connected) return;

    const id = setInterval(() => {
      fetchDashboard();
    }, REFETCH_INTERVAL_MS);

    return () => clearInterval(id);
  }, [publicKey, connected, fetchDashboard]);

  const refetch = useCallback(() => {
    if (publicKey && connected) {
      isRegisteredRef.current = true;
      fetchDashboard();
    }
  }, [publicKey, connected, fetchDashboard]);

  return {
    profile,
    tips,
    stats,
    loading,
    error,
    refetch,
    applyOptimisticWithdrawal,
    revertOptimisticWithdrawal,
  };
};
