import { ServiceUnavailableError } from "../../common/errors/AppError.js";
import { logger } from "../../common/utils/logger.js";

export type CircuitBreakerState = "CLOSED" | "OPEN" | "HALF_OPEN";

export class CircuitBreaker {
  private state: CircuitBreakerState = "CLOSED";
  private failureCount = 0;
  private lastFailureTime = 0;

  constructor(
    private readonly failureThreshold = 5,
    private readonly resetTimeoutMs = 30_000,
  ) {}

  getState(): CircuitBreakerState {
    return this.state;
  }

  getFailureCount(): number {
    return this.failureCount;
  }

  async call<T>(fn: () => Promise<T>): Promise<T> {
    if (this.state === "OPEN") {
      const elapsed = Date.now() - this.lastFailureTime;
      if (elapsed >= this.resetTimeoutMs) {
        logger.info("Circuit breaker transitioning to HALF_OPEN");
        this.state = "HALF_OPEN";
      } else {
        throw new ServiceUnavailableError(
          "X API circuit breaker is open - too many failures",
        );
      }
    }

    try {
      const result = await fn();
      if (this.state === "HALF_OPEN") {
        logger.info("Circuit breaker reset to CLOSED after successful call");
        this.reset();
      }
      this.failureCount = 0;
      this.lastFailureTime = 0;
      return result;
    } catch (error) {
      this.failureCount++;
      this.lastFailureTime = Date.now();
      if (this.failureCount >= this.failureThreshold) {
        logger.warn(
          { failureCount: this.failureCount },
          "Circuit breaker OPEN - too many failures",
        );
        this.state = "OPEN";
      }
      throw error;
    }
  }

  reset(): void {
    this.state = "CLOSED";
    this.failureCount = 0;
    this.lastFailureTime = 0;
  }
}

export const xCircuitBreaker = new CircuitBreaker();
