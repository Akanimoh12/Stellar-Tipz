import { SorobanRpc } from "@stellar/stellar-sdk";
import { config } from "../../config/index.js";
import { CircuitBreaker } from "../utils/circuitBreaker.js";
import { withTimeoutAndSignal } from "../utils/fetchWithTimeout.js";
import { logger } from "../utils/logger.js";

/**
 * Centralized Soroban RPC and Horizon resilience layer (issues #090, #091).
 * - Timeouts via withTimeoutAndSignal (configurable SOROBAN_RPC_TIMEOUT_MS / HORIZON_TIMEOUT_MS)
 * - Circuit breaker fast-fails when upstream degrades
 * - Client disconnect cancellation via parentSignal (req.signal)
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

export function getRpcServer(): SorobanRpc.Server {
  const rpcUrl = (config as unknown as { stellar?: { rpcUrl: string } })?.stellar?.rpcUrl ?? "https://soroban-testnet.stellar.org";
  return new SorobanRpc.Server(rpcUrl, {
    allowHttp: rpcUrl.startsWith("http://"),
  });
}

/**
 * Wraps an RPC operation with circuit breaker and timeout.
 * Use this for every SorobanRpc.Server call (getAccount, simulateTransaction, sendTransaction, getHealth).
 */
export async function rpcCall<T>(
  operation: (server: SorobanRpc.Server) => Promise<T>,
  opts: { signal?: AbortSignal; timeoutMs?: number; operationName?: string } = {},
): Promise<T> {
  const timeoutMs = opts.timeoutMs ?? (config as unknown as { timeouts?: { sorobanRpcMs: number } })?.timeouts?.sorobanRpcMs ?? 10_000;
  const name = opts.operationName ?? "RPC call";

  return rpcCircuitBreaker.call(async () => {
    const server = getRpcServer();
    const promise = operation(server);
    try {
      return await withTimeoutAndSignal(promise, timeoutMs, opts.signal, name);
    } catch (err) {
      if (err instanceof DOMException && err.name === "TimeoutError") {
        logger.warn({ operation: name, timeoutMs }, "Soroban RPC timeout");
      }
      throw err;
    }
  });
}

/**
 * Horizon fetch wrapper with same resilience properties.
 */
export async function horizonFetch(
  path: string,
  options: RequestInit & { signal?: AbortSignal; timeoutMs?: number } = {},
): Promise<Response> {
  const timeoutMs = (options as unknown as { timeoutMs?: number }).timeoutMs ?? (config as unknown as { timeouts?: { horizonMs: number } })?.timeouts?.horizonMs ?? 8_000;
  const signal = (options as unknown as { signal?: AbortSignal }).signal;
  const horizonUrl = (config as unknown as { stellar?: { horizonUrl: string } })?.stellar?.horizonUrl ?? "https://horizon-testnet.stellar.org";
  const url = `${horizonUrl.replace(/\/+$/, "")}${path}`;

  return horizonCircuitBreaker.call(async () => {
    // Import here to avoid cycle
    const { fetchWithTimeout } = await import("../utils/fetchWithTimeout.js");
    return fetchWithTimeout(url, {
      ...options,
      timeoutMs,
      parentSignal: signal,
    });
  });
}
