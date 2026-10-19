import { SorobanRpc } from "@stellar/stellar-sdk";
import { ProviderPool, parseProviderUrls } from "./providerPool.js";
import { config } from "../../config/index.js";
import { CircuitBreaker } from "../utils/circuitBreaker.js";
import { withTimeoutAndSignal } from "../utils/fetchWithTimeout.js";
import { logger } from "../utils/logger.js";
import { withSpan, addSpanAttributes, isTracingActive } from "../observability/tracing.js";
import { SpanStatusCode } from "@opentelemetry/api";
import { SEMATTRS_RPC_SYSTEM, SEMATTRS_RPC_METHOD, SEMATTRS_NETWORK_PEER_ADDRESS } from "@opentelemetry/semantic-conventions";

/**
 * Centralized Soroban RPC and Horizon resilience layer (issues #090, #091).
 * - Timeouts via withTimeoutAndSignal (configurable SOROBAN_RPC_TIMEOUT_MS / HORIZON_TIMEOUT_MS)
 * - Circuit breaker fast-fails when upstream degrades
 * - Client disconnect cancellation via parentSignal (req.signal)
 * - OpenTelemetry tracing for outbound RPC calls (issue #1349)
 */

// Shared breaker instances — state exposed via metrics endpoint (issue #091)
// Use optional chaining with defaults so mocked config in tests (e.g. securityHeaders.test) doesn't crash at import time
export const rpcCircuitBreaker = new CircuitBreaker(
  (config as unknown as { circuitBreaker?: { rpcThreshold: number } })?.circuitBreaker?.rpcThreshold ?? 5,
  (config as unknown as { circuitBreaker?: { rpcResetTimeoutMs: number } })?.circuitBreaker?.rpcResetTimeoutMs ?? 30_000,
  "Soroban RPC",
);

export const horizonCircuitBreaker = new CircuitBreaker(
  (config as unknown as { circuitBreaker?: { horizonThreshold: number } })?.circuitBreaker?.horizonThreshold ?? 5,
  (config as unknown as { circuitBreaker?: { horizonResetTimeoutMs: number } })?.circuitBreaker?.horizonResetTimeoutMs ?? 30_000,
  "Horizon",
);


const stellarConfig = (config as unknown as { stellar?: {
  rpcUrl: string; horizonUrl: string; rpcFallbackUrls?: string; horizonFallbackUrls?: string;
} }).stellar;
const rpcUrls = parseProviderUrls(stellarConfig?.rpcUrl ?? 'https://soroban-testnet.stellar.org', stellarConfig?.rpcFallbackUrls);
const horizonUrls = parseProviderUrls(stellarConfig?.horizonUrl ?? 'https://horizon-testnet.stellar.org', stellarConfig?.horizonFallbackUrls);

const rpcPool = new ProviderPool('soroban', rpcUrls,
  config.circuitBreaker?.rpcThreshold ?? 5, config.circuitBreaker?.rpcResetTimeoutMs ?? 30_000,
  async (url) => {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'getLatestLedger' }),
      signal: AbortSignal.timeout(5000),
    });
    if (!response.ok) throw new Error(`RPC health returned ${response.status}`);
    const payload = await response.json() as { result?: { sequence?: number }; error?: unknown };
    if (payload.error || !Number.isFinite(payload.result?.sequence)) throw new Error('RPC ledger health invalid');
    return payload.result!.sequence!;
  },
);

const horizonPool = new ProviderPool('horizon', horizonUrls,
  config.circuitBreaker?.horizonThreshold ?? 5, config.circuitBreaker?.horizonResetTimeoutMs ?? 30_000,
  async (url) => {
    const response = await fetch(`${url.replace(/\/+$/, '')}/ledgers?order=desc&limit=1`, { signal: AbortSignal.timeout(5000) });
    if (!response.ok) throw new Error(`Horizon health returned ${response.status}`);
    const payload = await response.json() as { _embedded?: { records?: { sequence?: number }[] } };
    return Number(payload._embedded?.records?.[0]?.sequence) || null;
  },
);

export function getRpcServer(): SorobanRpc.Server {
  const rpcUrl = (config as unknown as { stellar?: { rpcUrl: string } })?.stellar?.rpcUrl ?? "https://soroban-testnet.stellar.org";
  return new SorobanRpc.Server(rpcUrl, {
    allowHttp: rpcUrl.startsWith("http://"),
  });
}

/**
 * Wraps an RPC operation with circuit breaker, timeout, and tracing.
 * Use this for every SorobanRpc.Server call (getAccount, simulateTransaction, sendTransaction, getHealth).
 */
export async function rpcCall<T>(
  operation: (server: SorobanRpc.Server) => Promise<T>,
  opts: { signal?: AbortSignal; timeoutMs?: number; operationName?: string } = {},
): Promise<T> {
  const timeoutMs = opts.timeoutMs ?? (config as unknown as { timeouts?: { sorobanRpcMs: number } })?.timeouts?.sorobanRpcMs ?? 10_000;
  const name = opts.operationName ?? "RPC call";

  return withSpan(
    `rpc.soroban.${name}`,
    async (span) => {
      if (span) {
        span.setAttributes({
          [SEMATTRS_RPC_SYSTEM]: "soroban",
          [SEMATTRS_RPC_METHOD]: name,
          [SEMATTRS_NETWORK_PEER_ADDRESS]: (config as unknown as { stellar?: { rpcUrl: string } })?.stellar?.rpcUrl ?? "https://soroban-testnet.stellar.org",
        });
      }

      return rpcPool.call(async (providerUrl) => {
        const server = new SorobanRpc.Server(providerUrl, { allowHttp: providerUrl.startsWith('http://') });
        const promise = operation(server);
        try {
          return await withTimeoutAndSignal(promise, timeoutMs, opts.signal, name);
        } catch (err) {
          if (span) {
            span.setStatus({
              code: SpanStatusCode.ERROR,
              message: err instanceof Error ? err.message : String(err),
            });
            span.recordException(err as Error);
          }
          if (err instanceof DOMException && err.name === "TimeoutError") {
            logger.warn({ operation: name, timeoutMs }, "Soroban RPC timeout");
          }
          throw err;
        }
      });
    },
    { kind: 2 }, // SpanKind.CLIENT
  );
}

/**
 * Horizon fetch wrapper with same resilience properties and tracing.
 */
export async function horizonFetch(
  path: string,
  options: RequestInit & { signal?: AbortSignal; timeoutMs?: number } = {},
): Promise<Response> {
  const timeoutMs = (options as unknown as { timeoutMs?: number }).timeoutMs ?? (config as unknown as { timeouts?: { horizonMs: number } })?.timeouts?.horizonMs ?? 8_000;
  const signal = (options as unknown as { signal?: AbortSignal }).signal;
  const horizonUrl = (config as unknown as { stellar?: { horizonUrl: string } })?.stellar?.horizonUrl ?? "https://horizon-testnet.stellar.org";
  const url = `${horizonUrl.replace(/\/+$/, "")}${path}`;

  return withSpan(
    `rpc.horizon.${options.method ?? "GET"} ${path}`,
    async (span) => {
      if (span) {
        span.setAttributes({
          [SEMATTRS_RPC_SYSTEM]: "horizon",
          [SEMATTRS_RPC_METHOD]: options.method ?? "GET",
          [SEMATTRS_NETWORK_PEER_ADDRESS]: horizonUrl,
          "http.url": url,
          "http.path": path,
        });
      }

      return horizonPool.call(async (providerUrl) => {
        // Import here to avoid cycle
        const { fetchWithTimeout } = await import("../utils/fetchWithTimeout.js");
        const response = await fetchWithTimeout(`${providerUrl.replace(/\/+$/, '')}${path}`, {
          ...options,
          timeoutMs,
          parentSignal: signal,
        });
        if (response.status === 429 || response.status >= 500) throw new Error(`Horizon provider returned ${response.status}`);
        return response;
      });
    },
    { kind: 2 }, // SpanKind.CLIENT
  );
}
