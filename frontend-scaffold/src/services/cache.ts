export type CacheKeyPart = string | number | boolean | null | undefined;

export type CacheEntry<T> = {
  data: T;
  expiresAt: number;
  inFlightRefresh?: Promise<T>;
  lastUpdatedAt: number;
};

const DEFAULT_MAX_CACHE_SIZE = 200;

export class ContractQueryCache {
  private readonly cache = new Map<string, CacheEntry<unknown>>();

  constructor(private readonly maxSize: number = DEFAULT_MAX_CACHE_SIZE) {}

  async getOrFetch<T>(
    key: string,
    ttlMs: number,
    fetcher: () => Promise<T>,
  ): Promise<T> {
    const now = Date.now();
    const cached = this.cache.get(key) as CacheEntry<T> | undefined;

    if (cached) {
      if (cached.expiresAt > now) {
        return cached.data;
      }

      // Stale-while-revalidate:
      // return stale data instantly and refresh in the background.
      if (!cached.inFlightRefresh) {
        cached.inFlightRefresh = this.refreshEntry(key, ttlMs, fetcher, cached);
      }

      return cached.data;
    }

    const freshValue = await fetcher();
    this.set(key, {
      data: freshValue,
      expiresAt: now + ttlMs,
      lastUpdatedAt: now,
    });
    return freshValue;
  }

  invalidateAll(): void {
    this.cache.clear();
  }

  size(): number {
    return this.cache.size;
  }

  private async refreshEntry<T>(
    key: string,
    ttlMs: number,
    fetcher: () => Promise<T>,
    staleEntry: CacheEntry<T>,
  ): Promise<T> {
    try {
      const refreshed = await fetcher();
      const now = Date.now();
      this.set(key, {
        data: refreshed,
        expiresAt: now + ttlMs,
        lastUpdatedAt: now,
      });
      return refreshed;
    } catch (error) {
      // Keep stale value if background refresh fails.
      staleEntry.inFlightRefresh = undefined;
      throw error;
    } finally {
      const latest = this.cache.get(key) as CacheEntry<T> | undefined;
      if (latest) {
        latest.inFlightRefresh = undefined;
      }
    }
  }

  private set<T>(key: string, entry: CacheEntry<T>): void {
    this.cache.set(key, entry as CacheEntry<unknown>);
    this.enforceMaxSize();
  }

  private enforceMaxSize(): void {
    if (this.cache.size <= this.maxSize) {
      return;
    }

    const sortedByOldest = [...this.cache.entries()].sort(
      (a, b) => a[1].lastUpdatedAt - b[1].lastUpdatedAt,
    );

    while (this.cache.size > this.maxSize && sortedByOldest.length > 0) {
      const oldest = sortedByOldest.shift();
      if (!oldest) {
        break;
      }
      this.cache.delete(oldest[0]);
    }
  }
}

export const buildContractCacheKey = (
  method: string,
  ...params: CacheKeyPart[]
): string => {
  return JSON.stringify([method, ...params]);
};

export const contractQueryCache = new ContractQueryCache();
