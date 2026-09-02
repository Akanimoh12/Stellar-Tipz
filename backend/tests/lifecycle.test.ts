import { describe, it, expect, vi, beforeEach } from 'vitest';

describe('lifecycle registry', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('closes all registered resources in reverse order', async () => {
    const { registerClosable, closeAll } = await import('../src/common/utils/lifecycle.js');

    const order: string[] = [];
    registerClosable({ name: 'A', close: async () => { order.push('A'); } });
    registerClosable({ name: 'B', close: async () => { order.push('B'); } });

    await closeAll();

    expect(order).toEqual(['B', 'A']);
  });

  it('continues closing other resources if one throws', async () => {
    const { registerClosable, closeAll } = await import('../src/common/utils/lifecycle.js');

    const closed: string[] = [];
    registerClosable({ name: 'Good', close: async () => { closed.push('Good'); } });
    registerClosable({ name: 'Bad',  close: async () => { throw new Error('fail'); } });

    await expect(closeAll()).resolves.toBeUndefined();
    expect(closed).toContain('Good');
  });

  it('invokes the hard-exit fallback when draining exceeds the timeout', async () => {
    vi.useFakeTimers();
    const { withShutdownTimeout } = await import('../src/common/utils/lifecycle.js');
    const onTimeout = vi.fn();

    const result = withShutdownTimeout(() => new Promise<void>(() => {}), 100, onTimeout);
    await vi.advanceTimersByTimeAsync(100);

    await expect(result).resolves.toBe(false);
    expect(onTimeout).toHaveBeenCalledOnce();
    vi.useRealTimers();
  });
});
