import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { SorobanClient } from './soroban.client.js';
import { CursorStore } from './cursor.store.js';
import { IndexerService } from './indexer.service.js';

const { mockGetLatestLedger, mockGetEvents, mockIndexerCursorFindUnique, mockIndexerCursorUpsert, mockEventLogCreate, mockTipUpsert, mockTipFindUnique, mockTipUpdate } = vi.hoisted(() => ({
  mockGetLatestLedger: vi.fn(),
  mockGetEvents: vi.fn(),
  mockIndexerCursorFindUnique: vi.fn(),
  mockIndexerCursorUpsert: vi.fn(),
  mockEventLogCreate: vi.fn(),
  mockTipUpsert: vi.fn(),
  mockTipFindUnique: vi.fn(),
  mockTipUpdate: vi.fn(),
}));

vi.mock('@stellar/stellar-sdk', () => ({
  SorobanRpc: {
    Server: vi.fn(() => ({
      getLatestLedger: mockGetLatestLedger,
      getEvents: mockGetEvents,
    })),
  },
}));

vi.mock('../db/prisma.js', () => ({
  prisma: {
    indexerCursor: {
      findUnique: mockIndexerCursorFindUnique,
      upsert: mockIndexerCursorUpsert,
    },
    eventLog: {
      create: mockEventLogCreate,
      createMany: vi.fn(),
      findMany: vi.fn(),
      count: vi.fn(),
    },
    tip: {
      upsert: mockTipUpsert,
      findUnique: mockTipFindUnique,
      update: mockTipUpdate,
    },
  },
}));

const mockEvent = (overrides: Record<string, unknown> = {}) => ({
  id: '0000000000000001-0000000001',
  type: 'contract',
  ledger: 100,
  ledgerClosedAt: '2024-01-15T00:00:00Z',
  pagingToken: '100-1',
  inSuccessfulContractCall: true,
  txHash: 'abc123def456',
  contractId: { toString: () => 'CDLZFC3SYJYDZT7K3V6X5J3BZRKLMRLQKLMJFL7LRB7YH5R5R5R5R5R5' },
  topic: [{ sym: 'tip_sent' }],
  value: { type: 'scvMap' },
  ...overrides,
});

describe('SorobanClient', () => {
  let client: SorobanClient | null = null;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    client?.destroy();
    client = null;
  });

  it('returns latest ledger sequence', async () => {
    mockGetLatestLedger.mockResolvedValue({ sequence: 500 });
    client = new SorobanClient({ rpcUrl: 'http://localhost:8000' });
    const result = await client.getLatestLedger();
    expect(result).toBe(500);
  });

  it('fetches and processes events', async () => {
    mockGetEvents.mockResolvedValue({
      events: [
        mockEvent(),
        mockEvent({
          id: '0000000000000001-0000000002',
          topic: [{ sym: 'tip_withdrawn' }],
          ledger: 101,
          pagingToken: '101-1',
        }),
      ],
      latestLedger: 101,
    });

    client = new SorobanClient({ rpcUrl: 'http://localhost:8000' });
    const result = await client.fetchEvents(100);
    expect(result.events).toHaveLength(2);
    expect(result.events[0].topic).toBe('tip_sent');
    expect(result.events[1].topic).toBe('tip_withdrawn');
    expect(result.events[0].ledger).toBe(100);
    expect(result.events[0].txHash).toBe('abc123def456');
    expect(result.cursor).toBeNull();
  });

  it('filters out failed contract calls', async () => {
    mockGetEvents.mockResolvedValue({
      events: [
        mockEvent(),
        mockEvent({ inSuccessfulContractCall: false }),
      ],
      latestLedger: 100,
    });

    client = new SorobanClient({ rpcUrl: 'http://localhost:8000' });
    const result = await client.fetchEvents(100);
    expect(result.events).toHaveLength(1);
  });

  it('paginates through multiple pages', async () => {
    mockGetEvents
      .mockResolvedValueOnce({
        events: Array.from({ length: 100 }, (_, i) => mockEvent({ id: `evt-${i}`, pagingToken: `100-${i}` })),
        latestLedger: 200,
      })
      .mockResolvedValueOnce({
        events: [mockEvent({ id: 'evt-last', ledger: 150, pagingToken: '150-0' })],
        latestLedger: 200,
      });

    client = new SorobanClient({ rpcUrl: 'http://localhost:8000', requestsPerSecond: 1000 });
    const events = await client.getAllEvents(100);
    expect(events).toHaveLength(101);
    expect(mockGetEvents).toHaveBeenCalledTimes(2);
    expect(mockGetEvents).toHaveBeenNthCalledWith(1, {
      startLedger: 100,
      filters: [],
      cursor: undefined,
      limit: 100,
    });
    expect(mockGetEvents).toHaveBeenNthCalledWith(2, {
      startLedger: 100,
      filters: [],
      cursor: '100-99',
      limit: 100,
    });
  });

  it('uses contractIds filter when provided', async () => {
    mockGetEvents.mockResolvedValue({
      events: [],
      latestLedger: 100,
    });

    client = new SorobanClient({ rpcUrl: 'http://localhost:8000' });
    await client.fetchEvents(100, { contractIds: ['CA3D...'] });
    expect(mockGetEvents).toHaveBeenCalledWith({
      startLedger: 100,
      filters: [expect.objectContaining({ contractIds: ['CA3D...'] })],
      cursor: undefined,
      limit: 100,
    });
  });
});

describe('CursorStore', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns null when no cursor exists', async () => {
    mockIndexerCursorFindUnique.mockResolvedValue(null);
    const store = new CursorStore();
    const result = await store.get('contract_events');
    expect(result).toBeNull();
  });

  it('returns lastLedger when cursor exists', async () => {
    mockIndexerCursorFindUnique.mockResolvedValue({ topic: 'contract_events', lastLedger: 150 });
    const store = new CursorStore();
    const result = await store.get('contract_events');
    expect(result).toBe(150);
  });

  it('upserts on advance', async () => {
    mockIndexerCursorUpsert.mockResolvedValue({});
    const store = new CursorStore();
    await store.advance('contract_events', 200);
    expect(mockIndexerCursorUpsert).toHaveBeenCalledWith({
      where: { topic: 'contract_events' },
      update: { lastLedger: 200 },
      create: { topic: 'contract_events', lastLedger: 200 },
    });
  });
});

describe('IndexerService', () => {
  let service: IndexerService | null = null;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(async () => {
    if (service) {
      await service.stop();
      service = null;
    }
  });

  it('starts and processes from latest ledger when no cursor', async () => {
    mockGetLatestLedger.mockResolvedValue({ sequence: 300 });
    mockIndexerCursorFindUnique.mockResolvedValue(null);
    mockIndexerCursorUpsert.mockResolvedValue({});

    service = new IndexerService({
      client: new SorobanClient({ rpcUrl: 'http://localhost:8000' }),
    });

    await service.start();
    await service.stop();
    expect(mockIndexerCursorUpsert).toHaveBeenCalledWith(
      expect.objectContaining({ create: expect.objectContaining({ lastLedger: 300 }) }),
    );
  });

  it('resumes from saved cursor', async () => {
    mockGetLatestLedger.mockResolvedValue({ sequence: 300 });
    mockIndexerCursorFindUnique.mockResolvedValue({ topic: 'contract_events', lastLedger: 100 });
    mockGetEvents.mockResolvedValue({
      events: [mockEvent({ ledger: 101 })],
      latestLedger: 300,
    });
    mockEventLogCreate.mockResolvedValue({});
    mockIndexerCursorUpsert.mockResolvedValue({});

    service = new IndexerService({
      client: new SorobanClient({ rpcUrl: 'http://localhost:8000' }),
    });

    await service.start();
    await service.stop();
    expect(mockGetEvents).toHaveBeenCalled();
    expect(mockEventLogCreate).toHaveBeenCalled();
  });

  it('catch-up processes ledger range when cursor behind', async () => {
    mockIndexerCursorFindUnique.mockResolvedValue({ topic: 'contract_events', lastLedger: 50 });
    mockGetLatestLedger.mockResolvedValue({ sequence: 200 });
    mockGetEvents
      .mockResolvedValueOnce({
        events: [mockEvent({ ledger: 60, id: 'evt-60' })],
        latestLedger: 200,
      });
    mockEventLogCreate.mockResolvedValue({});
    mockIndexerCursorUpsert.mockResolvedValue({});

    service = new IndexerService({
      client: new SorobanClient({ rpcUrl: 'http://localhost:8000' }),
    });

    await service.start();
    await service.stop();
    expect(mockGetEvents).toHaveBeenCalled();
  });
});