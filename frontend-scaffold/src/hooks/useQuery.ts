import { useEffect, useState, useRef } from 'react';
import { queryCache } from '../lib/queryCache';

interface UseQueryOptions {
  staleTime?: number;
  cacheTime?: number;
  retry?: number;
  enabled?: boolean;
}

interface UseQueryResult<T> {
  data: T | null;
  loading: boolean;
  error: Error | null;
  refetch: () => Promise<void>;
}

/**
 * Universal data fetching hook with built-in caching, deduplication, and retry logic.
 * Replaces individual hook patterns like useTips, useProfile, etc.
 */
export const useQuery = <T,>(
  key: string,
  fetcher: () => Promise<T>,
  options: UseQueryOptions = {}
): UseQueryResult<T> => {
  const { enabled = true, ...cacheOptions } = options;
  const [state, setState] = useState<UseQueryResult<T>>({
    data: null,
    loading: true,
    error: null,
    refetch: async () => {},
  });

  const unsubscribeRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    if (!enabled) {
      setState((prev) => ({ ...prev, loading: false }));
      return;
    }

    let isMounted = true;

    const execute = async () => {
      try {
        const data = await queryCache.query(key, fetcher, cacheOptions);
        if (isMounted) {
          setState((prev) => ({ ...prev, data, loading: false, error: null }));
        }
      } catch (error) {
        if (isMounted) {
          const err = error instanceof Error ? error : new Error(String(error));
          setState((prev) => ({ ...prev, error: err, loading: false }));
        }
      }
    };

    execute();

    // Subscribe for invalidation updates
    unsubscribeRef.current = queryCache.subscribe(key, () => {
      if (isMounted) {
        execute();
      }
    });

    return () => {
      isMounted = false;
      unsubscribeRef.current?.();
    };
  }, [key, fetcher, enabled, cacheOptions]);

  const refetch = async () => {
    queryCache.invalidate(key);
    try {
      const data = await queryCache.query(key, fetcher, cacheOptions);
      setState((prev) => ({ ...prev, data, loading: false, error: null }));
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      setState((prev) => ({ ...prev, error: err, loading: false }));
    }
  };

  return { ...state, refetch };
};
