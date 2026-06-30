import { describe, expect, it, vi, beforeEach } from 'vitest';

const { mockStartIndexer, mockStop, mockDisconnect, mockCloseAll } = vi.hoisted(() => ({
  mockStartIndexer: vi.fn(),
  mockStop: vi.fn(),
  mockDisconnect: vi.fn(),
  mockCloseAll: vi.fn(),
}));

vi.mock('./poller.js', () => ({
  startIndexer: mockStartIndexer,
}));

vi.mock('../db/prisma.js', () => ({
  prisma: { $disconnect: mockDisconnect },
}));

vi.mock('../common/utils/lifecycle.js', () => ({
  registerClosable: vi.fn(),
  closeAll: mockCloseAll,
}));

describe('bootstrapIndexer', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    mockStartIndexer.mockReturnValue({ stop: mockStop });
    mockCloseAll.mockResolvedValue(undefined);
    mockDisconnect.mockResolvedValue(undefined);
  });

  it('starts the poll loop and registers Prisma plus indexer for shutdown', async () => {
    const { registerClosable } = await import('../common/utils/lifecycle.js');
    const { bootstrapIndexer } = await import('./main.js');

    await bootstrapIndexer();

    expect(mockStartIndexer).toHaveBeenCalledOnce();
    expect(registerClosable).toHaveBeenCalledTimes(2);
    expect(registerClosable).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'Prisma' }),
    );
    expect(registerClosable).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'Indexer' }),
    );
  });

  it('stops the indexer and disconnects Prisma on shutdown', async () => {
    const { registerClosable } = await import('../common/utils/lifecycle.js');
    const { bootstrapIndexer } = await import('./main.js');

    await bootstrapIndexer();

    const indexerRegistration = vi.mocked(registerClosable).mock.calls.find(
      ([entry]) => entry.name === 'Indexer',
    );
    expect(indexerRegistration).toBeDefined();

    await indexerRegistration![0].close();
    expect(mockStop).toHaveBeenCalledOnce();
  });
});
