import { describe, expect, it, vi, beforeEach } from 'vitest';

const mockQueueInstance = {
  name: '',
  close: vi.fn().mockResolvedValue(undefined),
  closed: false,
};
const mockQueue = vi.fn().mockImplementation((name: string) => ({
  ...mockQueueInstance,
  name,
}));
const mockWorker = vi.fn().mockImplementation((name: string, processor: any, opts: any) => ({
  name,
  on: vi.fn(),
  close: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('bullmq', () => ({
  Queue: mockQueue,
  Worker: mockWorker,
}));

vi.mock('../db/redis.js', () => ({
  redis: { url: 'redis://localhost:6379' },
  bullConnection: { url: 'redis://localhost:6379' },
}));

vi.mock('../config/env.js', () => ({
  env: {
    WORKER_CONCURRENCY_SUBSCRIPTION_CHARGE: 2,
    WORKER_CONCURRENCY_IPFS_PIN: 3,
    WORKER_CONCURRENCY_IPFS_CLEANUP: 2,
    WORKER_CONCURRENCY_X_REFRESH: 1,
    DATABASE_POOL_SIZE: 10,
  },
}));

vi.mock('../common/utils/logger.js', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

describe('queueFactory', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  describe('getQueue', () => {
    it('creates a new queue on first call', async () => {
      const { getQueue } = await import('./queueFactory.js');
      mockQueue.mockReturnValue({ name: 'test-queue' });

      const queue = getQueue('test-queue');

      expect(mockQueue).toHaveBeenCalledWith('test-queue', {
        connection: { url: 'redis://localhost:6379' },
        defaultJobOptions: {
          removeOnComplete: { age: 3600 },
          removeOnFail: { age: 86400 },
          attempts: 3,
          backoff: { type: 'exponential', delay: 2000 },
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

  describe('initializeQueues & getQueueConfigs', () => {
    it('initializes all defined queues', async () => {
      const { initializeQueues, getQueueConfigs, queues } = await import('./queueFactory.js');
      const configs = getQueueConfigs();
      expect(configs.length).toBeGreaterThanOrEqual(4);

      await initializeQueues();
      expect(queues.size).toBe(configs.length);
      for (const cfg of configs) {
        expect(queues.has(cfg.name)).toBe(true);
      }
    });

    it('creates worker with configured concurrency', async () => {
      const { createWorker } = await import('./queueFactory.js');
      const processor = vi.fn();
      const worker = await createWorker('subscription-charge', processor);

      expect(worker).toBeDefined();
      expect(mockWorker).toHaveBeenCalledWith(
        'subscription-charge',
        processor,
        expect.objectContaining({
          concurrency: 2,
        })
      );
    });

    it('throws error for unknown queue when creating worker', async () => {
      const { createWorker } = await import('./queueFactory.js');
      await expect(createWorker('unknown-queue', vi.fn())).rejects.toThrow('Unknown queue: unknown-queue');
    });

    it('gracefully closes all queues', async () => {
      const { initializeQueues, closeAllQueues, queues } = await import('./queueFactory.js');
      await initializeQueues();
      expect(queues.size).toBeGreaterThan(0);

      await closeAllQueues();
      // queues close() method was called
      expect(mockQueueInstance.close).toHaveBeenCalled();
    });
  });
});
