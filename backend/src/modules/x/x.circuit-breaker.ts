/**
 * Re-export shared circuit breaker — extracted without changing X's behaviour (issue #091).
 * The shared utility lives in src/common/utils/circuitBreaker.ts so RPC/Horizon can reuse it.
 * This file remains the import surface for X so x.circuit-breaker.test.ts passes unmodified.
 */
export {
  CircuitBreaker,
  xCircuitBreaker,
  type CircuitBreakerState,
  getCircuitBreakerMetrics,
} from "../../common/utils/circuitBreaker.js";
