import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { CircuitBreaker } from "./x.circuit-breaker.js";
import { ServiceUnavailableError } from "../../common/errors/AppError.js";

describe("CircuitBreaker", () => {
  let cb: CircuitBreaker;

  beforeEach(() => {
    cb = new CircuitBreaker(3, 10_000);
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("starts in CLOSED state", () => {
    expect(cb.getState()).toBe("CLOSED");
  });

  it("passes through successful calls", async () => {
    const result = await cb.call(async () => "success");
    expect(result).toBe("success");
    expect(cb.getState()).toBe("CLOSED");
  });

  it("opens after threshold failures", async () => {
    const fn = async () => {
      throw new Error("fail");
    };

    for (let i = 0; i < 3; i++) {
      await expect(cb.call(fn)).rejects.toThrow("fail");
    }

    expect(cb.getState()).toBe("OPEN");
    expect(cb.getFailureCount()).toBe(3);
  });

  it("fast-fails while open", async () => {
    const fn = async () => {
      throw new Error("fail");
    };

    for (let i = 0; i < 3; i++) {
      await expect(cb.call(fn)).rejects.toThrow("fail");
    }

    expect(cb.getState()).toBe("OPEN");

    await expect(cb.call(fn)).rejects.toThrow(ServiceUnavailableError);
    await expect(cb.call(fn)).rejects.toThrow("circuit breaker is open");
  });

  it("allows a request through after reset timeout (HALF_OPEN behavior)", async () => {
    const fn = async () => {
      throw new Error("fail");
    };

    for (let i = 0; i < 3; i++) {
      await expect(cb.call(fn)).rejects.toThrow("fail");
    }

    expect(cb.getState()).toBe("OPEN");

    vi.advanceTimersByTime(10_000);

    await expect(cb.call(fn)).rejects.toThrow("fail");
    expect(cb.getState()).toBe("OPEN");
  });

  it("resets to CLOSED on success in HALF_OPEN", async () => {
    const failingFn = async () => {
      throw new Error("fail");
    };

    for (let i = 0; i < 3; i++) {
      await expect(cb.call(failingFn)).rejects.toThrow("fail");
    }

    expect(cb.getState()).toBe("OPEN");

    vi.advanceTimersByTime(10_000);

    const result = await cb.call(async () => "recovered");
    expect(result).toBe("recovered");
    expect(cb.getState()).toBe("CLOSED");
    expect(cb.getFailureCount()).toBe(0);
  });

  it("re-opens on failure in HALF_OPEN", async () => {
    const fn = async () => {
      throw new Error("fail");
    };

    for (let i = 0; i < 3; i++) {
      await expect(cb.call(fn)).rejects.toThrow("fail");
    }

    vi.advanceTimersByTime(10_000);

    await expect(cb.call(fn)).rejects.toThrow("fail");
    expect(cb.getState()).toBe("OPEN");
  });

  it("tracks failure count", async () => {
    const fn = async () => {
      throw new Error("fail");
    };

    for (let i = 0; i < 3; i++) {
      await expect(cb.call(fn)).rejects.toThrow("fail");
      expect(cb.getFailureCount()).toBe(i + 1);
    }
  });

  it("resets failure count on success", async () => {
    await expect(cb.call(async () => "ok")).resolves.toBe("ok");
    expect(cb.getFailureCount()).toBe(0);
  });

  it("can be manually reset", async () => {
    const fn = async () => {
      throw new Error("fail");
    };

    for (let i = 0; i < 3; i++) {
      await expect(cb.call(fn)).rejects.toThrow("fail");
    }

    expect(cb.getState()).toBe("OPEN");

    cb.reset();
    expect(cb.getState()).toBe("CLOSED");
    expect(cb.getFailureCount()).toBe(0);

    const result = await cb.call(async () => "ok");
    expect(result).toBe("ok");
  });

  it("uses configurable threshold and reset timeout", async () => {
    const customCb = new CircuitBreaker(2, 5_000);

    const fn = async () => {
      throw new Error("fail");
    };

    await expect(customCb.call(fn)).rejects.toThrow("fail");
    expect(customCb.getState()).toBe("CLOSED");

    await expect(customCb.call(fn)).rejects.toThrow("fail");
    expect(customCb.getState()).toBe("OPEN");

    vi.advanceTimersByTime(5_000);

    const result = await customCb.call(async () => "ok");
    expect(result).toBe("ok");
    expect(customCb.getState()).toBe("CLOSED");
  });
});
