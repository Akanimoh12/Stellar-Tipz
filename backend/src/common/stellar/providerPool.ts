import { CircuitBreaker } from '../utils/circuitBreaker.js';
import { createCounter, createGauge } from '../observability/prometheus.js';
import { logger } from '../utils/logger.js';

/** A provider has its own breaker. Retry priority, not rotating round-robin. */
export class ProviderPool {
  private readonly breakers: CircuitBreaker[];
  private readonly lastHeight: number[];
  private lastProbeAt = 0;
  private readonly failures = createCounter({
    name: 'provider_failovers_total',
    help: 'Provider failover decisions by network and reason',
    labelNames: ['network', 'reason'] as const,
  });
  private readonly active = createGauge({
    name: 'provider_active_index',
    help: 'Active provider priority index (0 is the preferred primary)',
    labelNames: ['network'] as const,
  });
  private preferred = 0;

  constructor(
    readonly network: 'soroban' | 'horizon',
    readonly urls: readonly string[],
    threshold: number,
    resetMs: number,
    private readonly probe: (url: string) => Promise<number | null>,
    private readonly probeIntervalMs = 60_000,
  ) {
    if (!urls.length) throw new Error('At least one provider must be configured');
    this.breakers = urls.map((_, i) => new CircuitBreaker(threshold, resetMs, `${network} provider ${i}`));
    this.lastHeight = urls.map(() => 0);
    this.active.set({ network }, 0);
  }

  /** Probe on the request path at most once per interval; return to primary on recovery. */
  async checkHealth(now = Date.now()): Promise<void> {
    if (now - this.lastProbeAt < this.probeIntervalMs) return;
    this.lastProbeAt = now;
    const heights = await Promise.all(this.urls.map(async (url, index) => {
      try {
        const height = await this.breakers[index].call(() => this.probe(url));
        this.lastHeight[index] = height ?? 0;
        return height ?? 0;
      } catch {
        return 0;
      }
    }));
    const maximum = Math.max(...heights);
    const healthy = heights.findIndex((height) => height > 0 && height >= maximum - 5);
    if (healthy >= 0 && healthy < this.preferred) {
      logger.info({ network: this.network, provider: healthy }, 'Primary provider recovered');
      this.preferred = healthy;
      this.active.set({ network: this.network }, healthy);
    }
  }

  async call<T>(operation: (url: string) => Promise<T>): Promise<T> {
    await this.checkHealth();
    const order = [...this.urls.keys()].sort((a, b) => {
      if (a === this.preferred) return -1;
      if (b === this.preferred) return 1;
      return a - b;
    });
    let lastError: unknown;
    const freshest = Math.max(...this.lastHeight);
    for (const index of order) {
      // Do not route to a known stale endpoint unless there is no fresher source.
      if (freshest > 0 && this.lastHeight[index] > 0 && freshest - this.lastHeight[index] > 5) continue;
      try {
        const response = await this.breakers[index].call(() => operation(this.urls[index]));
        this.preferred = index;
        this.active.set({ network: this.network }, index);
        return response;
      } catch (error) {
        lastError = error;
        this.failures.inc({ network: this.network, reason: 'error' });
        logger.warn({ network: this.network, provider: index, err: error }, 'Provider failed; trying next');
      }
    }
    throw lastError ?? new Error(`All ${this.network} providers are stale or unavailable`);
  }
}

/** Parsed and bounded URL list, rejecting accidental duplicated endpoints. */
export function parseProviderUrls(primary: string, alternatives?: string): string[] {
  const urls = [primary, ...(alternatives?.split(',') ?? [])].map((url) => url.trim()).filter(Boolean);
  const result = [...new Set(urls)];
  for (const url of result) {
    const parsed = new URL(url);
    if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error('Provider URL must be HTTP(S)');
    if (parsed.username || parsed.password) throw new Error('Provider URL cannot contain credentials');
  }
  return result;
}
