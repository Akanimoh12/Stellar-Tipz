import { describe, expect, it, vi, beforeEach } from 'vitest';

const mockQueue = vi.fn();
vi.mock('bullmq', () => ({
  Queue: mockQueue,
}));

vi.mock('../db/redis.js', () => ({
  redis: { url: 'redis://localhost:6379' },
}));

describe('getQueue', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it('creates a new queue on first call', async () => {
    const { getQueue } = await import('./queueFactory.js');
    mockQueue.mockReturnValue({ name: 'test-queue' });

    const queue = getQueue('test-queue');

    expect(mockQueue).toHaveBeenCalledWith('test-queue', {
      connection: { url: 'redis://localhost:6379' },
      defaultJobOptions: {
        removeOnComplete: { age: 3600 },
        removeOnFail: { age: 86400 },
      },
    });
    expect(queue).toEqual({ name: 'test-queue' });
  });

  it('returns the same queue instance on subsequent calls', async () => {
    const { getQueue } = await import('./queueFactory.js');
    const instance = { name: 'cached-queue' };
    mockQueue.mockReturnValue(instance);

    const first = getQueue('cached-queue');
    const second = getQueue('cached-queue');

    expect(first).toBe(second);
    expect(mockQueue).toHaveBeenCalledTimes(1);
  });

  it('creates separate instances for different names', async () => {
    const { getQueue } = await import('./queueFactory.js');
    mockQueue.mockReturnValueOnce({ name: 'queue-a' }).mockReturnValueOnce({ name: 'queue-b' });

    const a = getQueue('queue-a');
    const b = getQueue('queue-b');

    expect(a).not.toBe(b);
    expect(mockQueue).toHaveBeenCalledTimes(2);
  });
});
