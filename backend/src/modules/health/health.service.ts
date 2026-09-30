import { logger } from '../../common/utils/logger.js';

export type DependencyName = 'postgres' | 'redis' | 'soroban-rpc' | 'indexer';

export type HealthCheckResult = {
  name: DependencyName;
  status: 'pass' | 'fail';
  durationMs: number;
  message?: string;
};

export type HealthResponse = {
  status: 'pass' | 'fail';
  checks: HealthCheckResult[];
  timestamp: string;
};

export type HealthDependencies = Record<DependencyName, () => Promise<unknown>>;

export type HealthService = {
  getLiveStatus: () => HealthResponse;
  getReadyStatus: () => Promise<HealthResponse>;
};

type HealthServiceOptions = {
  checkTimeoutMs?: number;
  cacheTtlMs?: number;
};

const DEFAULT_CHECK_TIMEOUT_MS = 3_000;
const DEFAULT_CACHE_TTL_MS = 5_000;

class HealthCheckTimeoutError extends Error {}

async function runWithTimeout(
  check: () => Promise<unknown>,
  name: DependencyName,
  timeoutMs: number,
): Promise<void> {
  let timeout: ReturnType<typeof setTimeout> | undefined;

  try {
    await Promise.race([
      Promise.resolve().then(check),
      new Promise<never>((_, reject) => {
        timeout = setTimeout(() => {
          reject(new HealthCheckTimeoutError(`${name} timed out after ${timeoutMs}ms`));
        }, timeoutMs);
      }),
    ]);
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

/** Creates an isolated health checker with bounded, briefly cached dependency probes. */
export function createHealthService(
  dependencies: HealthDependencies,
  options: HealthServiceOptions = {},
): HealthService {
  const checkTimeoutMs = options.checkTimeoutMs ?? DEFAULT_CHECK_TIMEOUT_MS;
  const cacheTtlMs = options.cacheTtlMs ?? DEFAULT_CACHE_TTL_MS;
  let cachedReady: { result: HealthResponse; expiresAt: number } | undefined;
  let inFlightReady: Promise<HealthResponse> | undefined;

  async function checkDependency(name: DependencyName): Promise<HealthCheckResult> {
    const startedAt = Date.now();

    try {
      await runWithTimeout(dependencies[name], name, checkTimeoutMs);
      return { name, status: 'pass', durationMs: Date.now() - startedAt };
    } catch (error) {
      logger.warn({ err: error, dependency: name }, 'Readiness dependency check failed');
      return {
        name,
        status: 'fail',
        durationMs: Date.now() - startedAt,
        message:
          error instanceof HealthCheckTimeoutError ? error.message : `${name} is unavailable`,
      };
    }
  }

  async function runReadyChecks(): Promise<HealthResponse> {
    const names: DependencyName[] = ['postgres', 'redis', 'soroban-rpc', 'indexer'];
    const checks = await Promise.all(names.map(checkDependency));

    return {
      status: checks.every((check) => check.status === 'pass') ? 'pass' : 'fail',
      checks,
      timestamp: new Date().toISOString(),
    };
  }

  return {
    getLiveStatus: () => ({
      status: 'pass',
      checks: [],
      timestamp: new Date().toISOString(),
    }),

    getReadyStatus: async () => {
      if (cachedReady && Date.now() < cachedReady.expiresAt) return cachedReady.result;
      if (inFlightReady) return inFlightReady;

      inFlightReady = runReadyChecks()
        .then((result) => {
          cachedReady = { result, expiresAt: Date.now() + cacheTtlMs };
          return result;
        })
        .finally(() => {
          inFlightReady = undefined;
        });

      return inFlightReady;
    },
  };
}
