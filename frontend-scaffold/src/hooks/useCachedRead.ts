/**
 * #1311 — Hook for read-only data fetching with offline cache fallback and staleness indicator.
 */

import { useState, useEffect, useCallback } from 'react';
import { useOfflineStatus } from './useOfflineStatus';

export interface UseCachedReadOptions<T> {
  key: string;
  fetcher: () => Promise<T>;
  ttlMs?: number;
  initialData?: T;
}

export interface UseCachedReadResult<T> {
  data: T | undefined;
  isLoading: boolean;
  isStale: boolean;
  cachedAt: Date | null;
  isOffline: boolean;
  error: Error | null;
  refetch: () => Promise<void>;
}

interface CacheEnvelope<T> {
  data: T;
  timestamp: number;
}

export function useCachedRead<T>({
  key,
  fetcher,
  ttlMs = 1000 * 60 * 15, // 15 minutes default
  initialData,
}: UseCachedReadOptions<T>): UseCachedReadResult<T> {
  const { isOffline } = useOfflineStatus();
  const [data, setData] = useState<T | undefined>(initialData);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isStale, setIsStale] = useState<boolean>(false);
  const [cachedAt, setCachedAt] = useState<Date | null>(null);
  const [error, setError] = useState<Error | null>(null);

  const storageKey = `tipz_cached_read_${key}`;

  const readFromCache = useCallback((): CacheEnvelope<T> | null => {
    if (typeof window === 'undefined') return null;
    try {
      const raw = localStorage.getItem(storageKey);
      if (!raw) return null;
      return JSON.parse(raw) as CacheEnvelope<T>;
    } catch {
      return null;
    }
  }, [storageKey]);

  const writeToCache = useCallback(
    (freshData: T) => {
      if (typeof window === 'undefined') return;
      try {
        const envelope: CacheEnvelope<T> = {
          data: freshData,
          timestamp: Date.now(),
        };
        localStorage.setItem(storageKey, JSON.stringify(envelope));
      } catch {
        // Storage full or unavailable
      }
    },
    [storageKey],
  );

  const loadData = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    const cached = readFromCache();
    if (cached) {
      setData(cached.data);
      setCachedAt(new Date(cached.timestamp));
      const age = Date.now() - cached.timestamp;
      setIsStale(age > ttlMs || isOffline);
    }

    if (isOffline) {
      setIsLoading(false);
      setIsStale(true);
      return;
    }

    try {
      const fresh = await fetcher();
      setData(fresh);
      writeToCache(fresh);
      setCachedAt(new Date());
      setIsStale(false);
    } catch (err) {
      const e = err instanceof Error ? err : new Error(String(err));
      setError(e);
      // Fallback to cache if available
      if (cached) {
        setData(cached.data);
        setIsStale(true);
      }
    } finally {
      setIsLoading(false);
    }
  }, [fetcher, isOffline, readFromCache, ttlMs, writeToCache]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  // Re-fetch automatically when coming back online
  useEffect(() => {
    if (!isOffline) {
      void loadData();
    }
  }, [isOffline, loadData]);

  return {
    data,
    isLoading,
    isStale,
    cachedAt,
    isOffline,
    error,
    refetch: loadData,
  };
}
