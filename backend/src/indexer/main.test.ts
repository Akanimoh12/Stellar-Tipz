import { describe, expect, it, vi, beforeEach } from 'vitest';

const {
  mockStartIndexer,
  mockStop,
  mockDisconnect,
  mockCloseAll,
  mockElectorStart,
  mockElectorStop,
  MockLeaderElector,
  leaderElection,
} = vi.hoisted(() => {
  const mockElectorStart = vi.fn();
  const mockElectorStop = vi.fn();
  return {
    mockStartIndexer: vi.fn(),
    mockStop: vi.fn(),
    mockDisconnect: vi.fn(),
    mockCloseAll: vi.fn(),
    mockElectorStart,
    mockElectorStop,
    MockLeaderElector: vi.fn(() => ({ start: mockElectorStart, stop: mockElectorStop })),
    leaderElection: { enabled: true, key: 'tipz:indexer:leader', leaseMs: 15_000, renewIntervalMs: 5_000 },
  };
});

vi.mock('./poller.js', () => ({
  startIndexer: mockStartIndexer,
}));

vi.mock('./leader.js', () => ({ LeaderElector: MockLeaderElector }));

vi.mock('../db/prisma.js', () => ({
  prisma: { $disconnect: mockDisconnect },
}));

vi.mock('../db/redis.js', () => ({ redis: { quit: vi.fn(), on: vi.fn() } }));

vi.mock('../config/index.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../config/index.js')>();
  return {
    config: { ...actual.config, indexer: { ...actual.config.indexer, leaderElection } },
  };
});

vi.mock('../common/utils/lifecycle.js', () => ({
  registerClosable: vi.fn(),
  closeAll: mockCloseAll,
  closeAllWithTimeout: vi.fn(),
}));

describe('bootstrapIndexer', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    leaderElection.enabled = true;
    mockStartIndexer.mockReturnValue({ stop: mockStop });
    mockCloseAll.mockResolvedValue(undefined);
    mockDisconnect.mockResolvedValue(undefined);
  });

  it('starts leader election and the poll loop, and registers every resource for shutdown', async () => {
    const { registerClosable } = await import('../common/utils/lifecycle.js');
    const { bootstrapIndexer } = await import('./main.js');

    await bootstrapIndexer();

    expect(MockLeaderElector).toHaveBeenCalledWith(
      expect.objectContaining({ key: 'tipz:indexer:leader', leaseMs: 15_000, renewIntervalMs: 5_000 }),
    );
    expect(mockElectorStart).toHaveBeenCalledOnce();
    expect(mockStartIndexer).toHaveBeenCalledWith({ leader: MockLeaderElector.mock.results[0].value });
    const names = vi.mocked(registerClosable).mock.calls.map(([entry]) => entry.name);
    // Closables shut down in reverse order: the indexer (and its lease) before Redis.
    expect(names).toEqual(['Prisma', 'PrismaIncludingDeleted', 'Redis', 'Indexer']);
  });

  it('stops polling before releasing the lease on shutdown', async () => {
    const { registerClosable } = await import('../common/utils/lifecycle.js');
    const { bootstrapIndexer } = await import('./main.js');

    await bootstrapIndexer();

    const indexerRegistration = vi.mocked(registerClosable).mock.calls.find(
      ([entry]) => entry.name === 'Indexer',
    );
    expect(indexerRegistration).toBeDefined();

    await indexerRegistration![0].close();
    expect(mockStop).toHaveBeenCalledOnce();
    expect(mockElectorStop).toHaveBeenCalledOnce();
    expect(mockStop.mock.invocationCallOrder[0]).toBeLessThan(mockElectorStop.mock.invocationCallOrder[0]);
  });

  it('runs without an elector when leader election is disabled', async () => {
    leaderElection.enabled = false;
    const { bootstrapIndexer } = await import('./main.js');

    await bootstrapIndexer();

    expect(MockLeaderElector).not.toHaveBeenCalled();
    expect(mockStartIndexer).toHaveBeenCalledWith({ leader: undefined });
  });
});
