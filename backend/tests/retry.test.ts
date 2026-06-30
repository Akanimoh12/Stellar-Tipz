import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { withRetry } from '../src/indexer/retry.js';

describe('withRetry', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns result immediately on success', async () => {
    const fn = vi.fn().mockResolvedValue('success');
    const result = await withRetry(fn);
    expect(result).toBe('success');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('retries on transient error', async () => {
    const transientError = new Error('Network timeout');
    const fn = vi.fn()
      .mockRejectedValueOnce(transientError)
      .mockResolvedValue('success');

    const promise = withRetry(fn, { maxAttempts: 3, initialDelayMs: 100 });

    await vi.runAllTimersAsync();

    const result = await promise;
    expect(result).toBe('success');
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('throws after max attempts on persistent error', async () => {
    const persistentError = new Error('Service unavailable');
    (persistentError as { status?: number }).status = 503;
    const fn = vi.fn().mockRejectedValue(persistentError);

    const promise = withRetry(fn, { maxAttempts: 3, initialDelayMs: 50 });

    await expect(promise).rejects.toThrow('Service unavailable');
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it('does not retry on non-transient error', async () => {
    const nonTransientError = new Error('Bad request');
    (nonTransientError as { status?: number }).status = 400;
    const fn = vi.fn().mockRejectedValue(nonTransientError);

    await expect(withRetry(fn)).rejects.toThrow('Bad request');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('uses exponential backoff', async () => {
    const fn = vi.fn()
      .mockRejectedValueOnce(new Error('timeout'))
      .mockRejectedValueOnce(new Error('timeout'))
      .mockResolvedValue('success');

    const promise = withRetry(fn, { maxAttempts: 3, initialDelayMs: 100, maxDelayMs: 1000 });

    let delaySum = 100;
    await vi.advanceTimersByTimeAsync(delaySum);
    delaySum += 200;
    await vi.advanceTimersByTimeAsync(delaySum);

    await promise;
    expect(fn).toHaveBeenCalledTimes(3);
  });
});