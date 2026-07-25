import { createServer } from 'node:http';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/** Socket.IO calls `new this.adapter(namespace)` then `.init()` as soon as `io.adapter(...)` is invoked, so the mock must behave like a real adapter constructor. */
class MockAdapter {
  constructor(readonly namespace: unknown) {}
  init(): void {}
}

const mockDuplicate = vi.fn();
const mockCreateAdapter = vi.fn(() => MockAdapter);

vi.mock('@socket.io/redis-adapter', () => ({
  createAdapter: mockCreateAdapter,
}));

vi.mock('../db/redis.js', () => ({
  redis: { duplicate: mockDuplicate },
}));

describe('Socket.IO Redis adapter wiring (#948)', () => {
  const originalFlag = process.env.REALTIME_REDIS_ADAPTER_ENABLED;

  beforeEach(() => {
    vi.resetModules();
    mockDuplicate.mockReset();
    mockCreateAdapter.mockClear();
  });

  afterEach(() => {
    process.env.REALTIME_REDIS_ADAPTER_ENABLED = originalFlag;
  });

  it('attaches the Redis adapter using two duplicated ioredis connections when enabled', async () => {
    process.env.REALTIME_REDIS_ADAPTER_ENABLED = 'true';
    const pubClient = { quit: vi.fn().mockResolvedValue(undefined) };
    const subClient = { quit: vi.fn().mockResolvedValue(undefined) };
    mockDuplicate.mockReturnValueOnce(pubClient).mockReturnValueOnce(subClient);

    const { initRealtime } = await import('./gateway.js');
    const httpServer = createServer();
    initRealtime(httpServer);

    expect(mockDuplicate).toHaveBeenCalledTimes(2);
    expect(mockCreateAdapter).toHaveBeenCalledWith(pubClient, subClient);

    httpServer.close();
  });

  it('does not attach the Redis adapter when disabled (the test-suite default)', async () => {
    process.env.REALTIME_REDIS_ADAPTER_ENABLED = 'false';

    const { initRealtime } = await import('./gateway.js');
    const httpServer = createServer();
    initRealtime(httpServer);

    expect(mockDuplicate).not.toHaveBeenCalled();
    expect(mockCreateAdapter).not.toHaveBeenCalled();

    httpServer.close();
  });
});
