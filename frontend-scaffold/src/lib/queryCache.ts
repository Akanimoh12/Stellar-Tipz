interface CacheEntry<T> {
  data: T;
  timestamp: number;
  subscribers: Set<() => void>;
}

interface QueryOptions {
  staleTime?: number; // ms until data is considered stale (default: 30s)
  cacheTime?: number; // ms to keep data in memory after last subscriber unsubscribes (default: 5m)
  retry?: number; // retry count on failure (default: 3)
}

interface CachedQueryState<T> {
  data: T | null;
  loading: boolean;
  error: Error | null;
}

const DEFAULT_STALE_TIME = 30 * 1000; // 30 seconds
const DEFAULT_CACHE_TIME = 5 * 60 * 1000; // 5 minutes
const DEFAULT_RETRY = 3;

class QueryCache {
  private cache = new Map<string, CacheEntry<any>>();
  private inFlightRequests = new Map<string, Promise<any>>();
  private cacheTimers = new Map<string, ReturnType<typeof setTimeout>>();
  private requestTimestamps = new Map<string, number>();

  async query<T>(
    key: string,
    fetcher: () => Promise<T>,
    options: QueryOptions = {}
  ): Promise<T> {
    const {
      staleTime = DEFAULT_STALE_TIME,
      cacheTime = DEFAULT_CACHE_TIME,
      retry = DEFAULT_RETRY,
    } = options;

    const now = Date.now();
    const cached = this.cache.get(key);

    // Return fresh cache if within staleTime
    if (cached && now - cached.timestamp < staleTime) {
      return cached.data;
    }

    // Return inflight request to deduplicate
    if (this.inFlightRequests.has(key)) {
      return this.inFlightRequests.get(key)!;
    }

    // Initiate new fetch with retry
    const promise = this.fetchWithRetry(fetcher, key, retry)
      .then((data) => {
        this.cache.set(key, {
          data,
          timestamp: Date.now(),
          subscribers: cached?.subscribers ?? new Set(),
        });
        this.scheduleEviction(key, cacheTime);
        return data;
      })
      .catch((error) => {
        // Return stale data on error if available
        if (cached) {
          return cached.data;
        }
        throw error;
      })
      .finally(() => {
        this.inFlightRequests.delete(key);
      });

    this.inFlightRequests.set(key, promise);
    return promise;
  }

  private async fetchWithRetry<T>(
    fetcher: () => Promise<T>,
    key: string,
    retries: number
  ): Promise<T> {
    let lastError: Error | null = null;

    for (let i = 0; i <= retries; i++) {
      try {
        return await fetcher();
      } catch (error) {
        lastError =
          error instanceof Error ? error : new Error(String(error));
        if (i < retries) {
          // Exponential backoff: 100ms, 200ms, 400ms
          await new Promise((resolve) =>
            setTimeout(resolve, Math.pow(2, i) * 100)
          );
        }
      }
    }

    throw lastError;
  }

  private scheduleEviction(key: string, cacheTime: number): void {
    // Clear existing timer
    const existingTimer = this.cacheTimers.get(key);
    if (existingTimer) clearTimeout(existingTimer);

    // Schedule new eviction only if no active subscribers
    const timer = setTimeout(() => {
      const entry = this.cache.get(key);
      if (entry && entry.subscribers.size === 0) {
        this.cache.delete(key);
        this.cacheTimers.delete(key);
      }
    }, cacheTime);

    this.cacheTimers.set(key, timer);
  }

  subscribe(key: string, callback: () => void): () => void {
    let entry = this.cache.get(key);
    if (!entry) {
      entry = { data: null, timestamp: 0, subscribers: new Set() };
      this.cache.set(key, entry);
    }

    entry.subscribers.add(callback);

    // Unsubscribe function
    return () => {
      entry!.subscribers.delete(callback);
      if (entry!.subscribers.size === 0) {
        // Start eviction timer when last subscriber unsubscribes
        this.scheduleEviction(key, DEFAULT_CACHE_TIME);
      }
    };
  }

  invalidate(pattern?: string): void {
    if (!pattern) {
      this.cache.clear();
      this.inFlightRequests.clear();
      return;
    }

    const keys = Array.from(this.cache.keys());
    keys.forEach((key) => {
      if (key.includes(pattern)) {
        this.cache.delete(key);
      }
    });
  }

  getState<T>(key: string, fetcher: () => Promise<T>): CachedQueryState<T> {
    const cached = this.cache.get(key);
    return {
      data: cached?.data ?? null,
      loading: this.inFlightRequests.has(key),
      error: null,
    };
  }
}

export const queryCache = new QueryCache();
