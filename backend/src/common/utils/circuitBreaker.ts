import { ServiceUnavailableError } from "../errors/AppError.js";
import { logger } from "./logger.js";

/**
 * Shared circuit breaker utility (issue #091).
 * Generic implementation extracted from x.circuit-breaker.ts — behaviour must stay identical
 * so x.circuit-breaker.test.ts passes unmodified.
 *
 * State machine: CLOSED -> OPEN (after threshold failures) -> HALF_OPEN (after reset timeout) -> CLOSED or OPEN.
 */

export type CircuitBreakerState = "CLOSED" | "OPEN" | "HALF_OPEN";

export interface CircuitBreakerOptions {
  /** Human-readable name for logging/metrics (e.g. "X API", "Soroban RPC", "Horizon"). */
  name?: string;
  failureThreshold?: number;
  resetTimeoutMs?: number;
}

const breakerMetrics: Map<string, { state: CircuitBreakerState; failures: number; opens: number }> = new Map();

export function getCircuitBreakerMetrics(): Record<string, { state: CircuitBreakerState; failures: number; opens: number }> {
  const out: Record<string, { state: CircuitBreakerState; failures: number; opens: number }> = {};
  for (const [k, v] of breakerMetrics.entries()) out[k] = { ...v };
  return out;
}

export function recordCircuitBreakerState(name: string, state: CircuitBreakerState, failures: number): void {
  const existing = breakerMetrics.get(name) ?? { state: "CLOSED", failures: 0, opens: 0 };
  if (state === "OPEN" && existing.state !== "OPEN") {
    existing.opens += 1;
  }
  existing.state = state;
  existing.failures = failures;
  breakerMetrics.set(name, existing);
}

export class CircuitBreaker {
  private state: CircuitBreakerState = "CLOSED";
  private failureCount = 0;
  private lastFailureTime = 0;
  private readonly name: string;

  constructor(
    private readonly failureThreshold = 5,
    private readonly resetTimeoutMs = 30_000,
    name?: string,
  ) {
    this.name = name ?? "circuit-breaker";
    recordCircuitBreakerState(this.name, this.state, this.failureCount);
  }

  /** Allow string name as third arg or options object for forward compatibility */
  static fromOptions(opts: CircuitBreakerOptions = {}): CircuitBreaker {
    return new CircuitBreaker(opts.failureThreshold ?? 5, opts.resetTimeoutMs ?? 30_000, opts.name);
  }

  getState(): CircuitBreakerState {
    return this.state;
  }

  getFailureCount(): number {
    return this.failureCount;
  }

  getName(): string {
    return this.name;
  }

  async call<T>(fn: () => Promise<T>): Promise<T> {
    if (this.state === "OPEN") {
      const elapsed = Date.now() - this.lastFailureTime;
      if (elapsed >= this.resetTimeoutMs) {
        logger.info({ breaker: this.name }, "Circuit breaker transitioning to HALF_OPEN");
        this.state = "HALF_OPEN";
        recordCircuitBreakerState(this.name, this.state, this.failureCount);
      } else {
        // Preserve X API wording for backwards compat; generic name still satisfies substring check "circuit breaker is open"
        const message = this.name === "X API"
          ? "X API circuit breaker is open - too many failures"
          : `${this.name} circuit breaker is open - too many failures`;
        throw new ServiceUnavailableError(message);
      }
    }

    try {
      const result = await fn();
      if (this.state === "HALF_OPEN") {
        logger.info({ breaker: this.name }, "Circuit breaker reset to CLOSED after successful call");
        this.reset();
      } else {
        this.failureCount = 0;
        this.lastFailureTime = 0;
        recordCircuitBreakerState(this.name, this.state, this.failureCount);
      }
      return result;
    } catch (error) {
      this.failureCount++;
      this.lastFailureTime = Date.now();
      if (this.failureCount >= this.failureThreshold) {
        logger.warn(
          { breaker: this.name, failureCount: this.failureCount },
          "Circuit breaker OPEN - too many failures",
        );
        this.state = "OPEN";
        recordCircuitBreakerState(this.name, this.state, this.failureCount);
      } else {
        recordCircuitBreakerState(this.name, this.state, this.failureCount);
      }
      throw error;
    }
  }

  reset(): void {
    this.state = "CLOSED";
    this.failureCount = 0;
    this.lastFailureTime = 0;
    recordCircuitBreakerState(this.name, this.state, this.failureCount);
  }
}

// Default X breaker for re-export compatibility - must match original defaults (5, 30_000)
export const xCircuitBreaker = new CircuitBreaker(5, 30_000, "X API");

// Pre-configured breakers for RPC and Horizon (issue #091)
export function createRpcCircuitBreaker(threshold = 5, resetMs = 30_000): CircuitBreaker {
  return new CircuitBreaker(threshold, resetMs, "Soroban RPC");
}
export function createHorizonCircuitBreaker(threshold = 5, resetMs = 30_000): CircuitBreaker {
  return new CircuitBreaker(threshold, resetMs, "Horizon");
}
