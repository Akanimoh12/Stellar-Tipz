import request from 'supertest';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { createApp } from '../../app.js';
import { openApiDocument } from '../../docs/openapi.js';

const {
  mockGetAccount,
  mockSimulateTransaction,
  mockContractCall,
  mockFindMany,
  mockFindUnique,
  mockCreate,
  mockUpdate,
  mockGroupBy,
} = vi.hoisted(() => ({
  mockGetAccount: vi.fn(),
  mockSimulateTransaction: vi.fn(),
  mockContractCall: vi.fn(),
  mockFindMany: vi.fn(),
  mockFindUnique: vi.fn(),
  mockCreate: vi.fn(),
  mockUpdate: vi.fn(),
  mockGroupBy: vi.fn(),
}));

vi.mock('@stellar/stellar-sdk', () => {
  const mockPreparedTx = {
    build: vi.fn(() => ({
      toEnvelope: vi.fn(() => ({
        toXDR: vi.fn(() => 'AAAAAgAAAAA...mock-unsigned-xdr...'),
      })),
    })),
  };

  return {
    Keypair: {
      fromPublicKey: vi.fn(),
    },
    TransactionBuilder: vi.fn(() => ({
      addOperation: vi.fn(() => ({
        setTimeout: vi.fn(() => ({
          build: vi.fn(() => ({})),
        })),
      })),
    })),
    SorobanRpc: {
      Server: vi.fn(() => ({
        getAccount: mockGetAccount,
        simulateTransaction: mockSimulateTransaction,
      })),
      assembleTransaction: vi.fn(() => mockPreparedTx),
      Api: {
        isSimulationError: vi.fn(() => false),
      },
    },
    Contract: vi.fn(() => ({
      call: mockContractCall,
    })),
    nativeToScVal: vi.fn(() => ({ type: 'scval' })),
    xdr: {
      ScVal: {
        scvVoid: () => ({}),
      },
    },
    Networks: {
      TESTNET: 'Test SDF Network ; September 2015',
    },
  };
});

vi.mock('../../db/prisma.js', () => ({
  prisma: {
    tip: {
      findMany: mockFindMany,
      findUnique: mockFindUnique,
      create: mockCreate,
      update: mockUpdate,
      groupBy: mockGroupBy,
    },
    $disconnect: vi.fn(),
  },
}));

// ── Helpers ────────────────────────────────────────────────────────────────

const now = new Date('2026-06-29T00:00:00.000Z');
const from = 'GF5YV3FQRHRMA7IQWCZKGRRJ5P7CEPIVBQLM4X2FEHS2IU57KF3U4CLN';
const to   = 'GCEZWKCA5VLDNRLN3RPRJMRZOX3Z6G5CHCGBFMF5CKFHGZXABSZLAZP2';

function makeTipRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'clh1234567890',
    txHash: 'abc123txhash',
    ledger: 100,
    fromAddress: from,
    toAddress: to,
    amountStroops: BigInt(1_000_000),
    networkFee: BigInt(0),
    tokenCode: 'XLM',
    isAnonymous: false,
    status: 'PENDING',
    message: 'Great work!',
    createdAt: now,
    updatedAt: now,
    senderId: null,
    recipientId: null,
    ...overrides,
  };
}

// ── POST /api/v1/tips/prepare ─────────────────────────────────────────────

describe('POST /api/v1/tips/prepare', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 400 when inputs are missing', async () => {
    const app = createApp();
    const res = await request(app)
      .post('/api/v1/tips/prepare')
      .send({});
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('returns 400 for invalid stellar addresses', async () => {
    const app = createApp();
    const res = await request(app)
      .post('/api/v1/tips/prepare')
      .send({ from: 'not-valid', to: 'also-not-valid', amount: '100' });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('returns prepared transaction on success', async () => {
    mockGetAccount.mockResolvedValue({
      accountId: () => from,
      sequenceNumber: () => '123',
      incrementSequenceNumber: () => {},
    });
    mockSimulateTransaction.mockResolvedValue({});

    const app = createApp();
    const res = await request(app)
      .post('/api/v1/tips/prepare')
      .send({ from, to, amount: '100', message: 'Great content!' });
    expect(res.status).toBe(200);
    expect(res.body.data.unsignedTxXdr).toBeDefined();
    expect(res.body.data.contractId).toBeDefined();
  });
});

// ── GET /api/v1/tips ──────────────────────────────────────────────────────

describe('GET /api/v1/tips', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns paginated tips', async () => {
    mockFindMany.mockResolvedValue([
      makeTipRow({ id: '1', txHash: 'hash-1', ledger: 100, amountStroops: BigInt(100), message: 'Nice!' }),
      makeTipRow({ id: '2', txHash: 'hash-2', ledger: 101, fromAddress: to, toAddress: from, amountStroops: BigInt(200), message: null }),
    ]);

    const app = createApp();
    const res = await request(app).get('/api/v1/tips');
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(2);
    expect(res.body.data[0].amountStroops).toBe('100');
    expect(res.body.data[0].status).toBe('PENDING');
    expect(res.body.data[0].createdAt).toBe(now.toISOString());
    expect(res.body.nextCursor).toBeNull();
  });

  it('includes nextCursor when there are more results', async () => {
    mockFindMany.mockResolvedValue(
      Array.from({ length: 21 }, (_, i) =>
        makeTipRow({ id: `${i + 1}`, txHash: `hash-${i + 1}`, ledger: 100 + i, amountStroops: BigInt((i + 1) * 10) }),
      ),
    );

    const app = createApp();
    const res = await request(app).get('/api/v1/tips?limit=20');
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(20);
    expect(res.body.nextCursor).toBe('20');
  });

  it('returns empty array when no tips', async () => {
    mockFindMany.mockResolvedValue([]);

    const app = createApp();
    const res = await request(app).get('/api/v1/tips');
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(0);
    expect(res.body.nextCursor).toBeNull();
  });

  it('filters by address', async () => {
    mockFindMany.mockResolvedValue([
      makeTipRow({ id: '3', txHash: 'hash-3', ledger: 102, amountStroops: BigInt(50), message: null }),
    ]);

    const app = createApp();
    const res = await request(app).get(`/api/v1/tips?address=${from}`);
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
  });

  it('filters by direction=sent', async () => {
    mockFindMany.mockResolvedValue([]);

    const app = createApp();
    const res = await request(app).get(`/api/v1/tips?address=${from}&direction=sent`);
    expect(res.status).toBe(200);
    expect(mockFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ fromAddress: { equals: from, mode: 'insensitive' } }),
      }),
    );
  });

  it('returns 400 for invalid limit', async () => {
    const app = createApp();
    const res = await request(app).get('/api/v1/tips?limit=0');
    expect(res.status).toBe(400);
  });

it('returns 400 for invalid address', async () => {
    const app = createApp();
    const res = await request(app).get('/api/v1/tips?address=not-valid');
    expect(res.status).toBe(400);
  });
});

// ── GET /api/v1/tips?aggregate=creator — tip totals per creator (#883) ────────────

describe('GET /api/v1/tips?aggregate=creator', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns aggregated tip totals per creator', async () => {
    const addr1 = 'GA123456789012345678901234567890123456789012345678901234';
    const addr2 = 'GB123456789012345678901234567890123456789012345678901234';
    mockGroupBy.mockResolvedValue([
      { toAddress: addr1, _sum: { amountStroops: BigInt(5000000) }, _count: { _all: 5 } },
      { toAddress: addr2, _sum: { amountStroops: BigInt(3000000) }, _count: { _all: 3 } },
    ]);

    const app = createApp();
    const res = await request(app).get('/api/v1/tips?aggregate=creator');
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(2);
    expect(res.body.data[0]).toEqual({
      toAddress: addr1,
      totalAmountStroops: '5000000',
      tipCount: 5,
    });
    expect(res.body.data[1]).toEqual({
      toAddress: addr2,
      totalAmountStroops: '3000000',
      tipCount: 3,
    });
  });

  it('returns zero total when no tips exist', async () => {
    mockGroupBy.mockResolvedValue([]);

    const app = createApp();
    const res = await request(app).get('/api/v1/tips?aggregate=creator');
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(0);
  });

  it('orders results by total amount descending', async () => {
    const addr1 = 'GA123456789012345678901234567890123456789012345678901234';
    const addr2 = 'GB123456789012345678901234567890123456789012345678901234';
    mockGroupBy.mockResolvedValue([
      { toAddress: addr1, _sum: { amountStroops: BigInt(100) }, _count: { _all: 1 } },
      { toAddress: addr2, _sum: { amountStroops: BigInt(500) }, _count: { _all: 1 } },
    ]);

    const app = createApp();
    const res = await request(app).get('/api/v1/tips?aggregate=creator');
    expect(res.status).toBe(200);
    expect(res.body.data[0].toAddress).toBe(addr2);
  });

  it('returns 400 for invalid aggregate value', async () => {
    const app = createApp();
    const res = await request(app).get('/api/v1/tips?aggregate=invalid');
    expect(res.status).toBe(400);
  });
});

// ── Cursor-chain pagination (#881) ────────────────────────────────────────

describe('GET /api/v1/tips — cursor-based pagination chain', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('uses nextCursor from page 1 to request page 2', async () => {
    const page1Rows = Array.from({ length: 21 }, (_, i) =>
      makeTipRow({ id: `cuid-${String(i + 1).padStart(5, '0')}`, txHash: `hash-${i}`, ledger: 100 + i, amountStroops: BigInt(i + 1) }),
    );
    mockFindMany.mockResolvedValueOnce(page1Rows);

    const app = createApp();
    const page1 = await request(app).get('/api/v1/tips?limit=20');
    expect(page1.status).toBe(200);
    const cursor = page1.body.nextCursor as string;
    expect(cursor).toBe('cuid-00020');

    mockFindMany.mockResolvedValueOnce([
      makeTipRow({ id: 'cuid-00021', txHash: 'hash-20', ledger: 120, amountStroops: BigInt(21) }),
    ]);

    const page2 = await request(app).get(`/api/v1/tips?limit=20&cursor=${cursor}`);
    expect(page2.status).toBe(200);
    expect(page2.body.data).toHaveLength(1);
    expect(page2.body.nextCursor).toBeNull();

    expect(mockFindMany).toHaveBeenNthCalledWith(2,
      expect.objectContaining({
        cursor: { id: cursor },
        skip: 1,
      }),
    );
  });

  it('returns 400 for a non-cuid cursor value', async () => {
    const app = createApp();
    const res = await request(app).get('/api/v1/tips?cursor=not-a-cuid');
    expect(res.status).toBe(400);
  });

  it('nextCursor is null on the last page', async () => {
    mockFindMany.mockResolvedValue(
      Array.from({ length: 5 }, (_, i) =>
        makeTipRow({ id: `cuid-${i}`, txHash: `hash-${i}`, ledger: 100 + i }),
      ),
    );

    const app = createApp();
    const res = await request(app).get('/api/v1/tips?limit=10');
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(5);
    expect(res.body.nextCursor).toBeNull();
  });
});

// ── POST /api/v1/tips — dedupe by txHash ─────────────────────────────────

describe('POST /api/v1/tips — dedupe by txHash', () => {
  const validBody = {
    txHash: 'abc123txhash',
    ledger: 100,
    fromAddress: from,
    toAddress: to,
    amountStroops: '1000000',
    message: 'Great work!',
  };
  const tipRow = makeTipRow();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 400 when required fields are missing', async () => {
    const app = createApp();
    const res = await request(app).post('/api/v1/tips').send({});
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('creates and returns a new tip when txHash is unique', async () => {
    mockFindUnique.mockResolvedValue(null);
    mockCreate.mockResolvedValue(tipRow);

    const app = createApp();
    const res = await request(app).post('/api/v1/tips').send(validBody);
    expect(res.status).toBe(200);
    expect(res.body.data.txHash).toBe('abc123txhash');
    expect(res.body.data.amountStroops).toBe('1000000');
    expect(res.body.data.status).toBe('PENDING');
    expect(mockCreate).toHaveBeenCalledTimes(1);
  });

  it('returns the existing tip without a duplicate insert when txHash already exists', async () => {
    mockFindUnique.mockResolvedValue(tipRow);

    const app = createApp();
    const res = await request(app).post('/api/v1/tips').send(validBody);
    expect(res.status).toBe(200);
    expect(res.body.data.txHash).toBe('abc123txhash');
    expect(mockCreate).not.toHaveBeenCalled();
  });
});

// ── PATCH /api/v1/tips/:txHash/confirm — status lifecycle (#880) ──────────

describe('PATCH /api/v1/tips/:txHash/confirm', () => {
  const txHash = 'abc123txhash';
  const pendingRow = makeTipRow({ status: 'PENDING' });
  const confirmedRow = makeTipRow({ status: 'CONFIRMED' });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 404 when the tip does not exist', async () => {
    mockFindUnique.mockResolvedValue(null);

    const app = createApp();
    const res = await request(app).patch(`/api/v1/tips/${txHash}/confirm`);
    expect(res.status).toBe(404);
  });

  it('transitions PENDING → CONFIRMED and returns the updated tip', async () => {
    mockFindUnique.mockResolvedValue(pendingRow);
    mockUpdate.mockResolvedValue(confirmedRow);

    const app = createApp();
    const res = await request(app).patch(`/api/v1/tips/${txHash}/confirm`);
    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('CONFIRMED');
    expect(mockUpdate).toHaveBeenCalledWith({
      where: { txHash },
      data: { status: 'CONFIRMED' },
    });
  });

  it('is idempotent — a CONFIRMED tip is returned as-is without calling update', async () => {
    mockFindUnique.mockResolvedValue(confirmedRow);

    const app = createApp();
    const res = await request(app).patch(`/api/v1/tips/${txHash}/confirm`);
    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('CONFIRMED');
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it('returns 404 when txHash path param is empty segment', async () => {
    const app = createApp();
    const res = await request(app).patch('/api/v1/tips//confirm');
    expect(res.status).toBe(404);
  });
});

// ── OpenAPI docs registration ───────────────────────────────────────────────

describe('OpenAPI docs - Tips module', () => {
  it('registers GET /api/v1/tips endpoint', () => {
    expect(openApiDocument.paths['/api/v1/tips'].get).toBeDefined();
    expect(openApiDocument.paths['/api/v1/tips'].get?.tags).toContain('Tips');
    expect(openApiDocument.paths['/api/v1/tips'].get?.summary).toBe('List tips with optional filtering');
  });

  it('registers POST /api/v1/tips endpoint', () => {
    expect(openApiDocument.paths['/api/v1/tips'].post).toBeDefined();
    expect(openApiDocument.paths['/api/v1/tips'].post?.tags).toContain('Tips');
    expect(openApiDocument.paths['/api/v1/tips'].post?.summary).toBe('Record an on-chain tip');
  });

  it('registers POST /api/v1/tips/prepare endpoint', () => {
    expect(openApiDocument.paths['/api/v1/tips/prepare'].post).toBeDefined();
    expect(openApiDocument.paths['/api/v1/tips/prepare'].post?.tags).toContain('Tips');
    expect(openApiDocument.paths['/api/v1/tips/prepare'].post?.summary).toBe('Prepare an unsigned Soroban tip transaction');
  });

  it('registers GET /api/v1/tips/:id endpoint', () => {
    expect(openApiDocument.paths['/api/v1/tips/{id}'].get).toBeDefined();
    expect(openApiDocument.paths['/api/v1/tips/{id}'].get?.tags).toContain('Tips');
    expect(openApiDocument.paths['/api/v1/tips/{id}'].get?.summary).toBe('Get a single tip by id');
  });

  it('registers PATCH /api/v1/tips/:txHash/confirm endpoint', () => {
    expect(openApiDocument.paths['/api/v1/tips/{txHash}/confirm'].patch).toBeDefined();
    expect(openApiDocument.paths['/api/v1/tips/{txHash}/confirm'].patch?.tags).toContain('Tips');
    expect(openApiDocument.paths['/api/v1/tips/{txHash}/confirm'].patch?.summary).toBe('Confirm a pending tip');
  });

  it('registers profile tips endpoint at /api/v1/profiles/:username/tips', () => {
    expect(openApiDocument.paths['/api/v1/profiles/{username}/tips'].get).toBeDefined();
    expect(openApiDocument.paths['/api/v1/profiles/{username}/tips'].get?.tags).toContain('Tips');
    expect(openApiDocument.paths['/api/v1/profiles/{username}/tips'].get?.summary).toBe('List tips received by a profile');
  });

  it('registers user-sent tips endpoint at /api/v1/users/me/tips/sent', () => {
    expect(openApiDocument.paths['/api/v1/users/me/tips/sent'].get).toBeDefined();
    expect(openApiDocument.paths['/api/v1/users/me/tips/sent'].get?.tags).toContain('Tips');
    expect(openApiDocument.paths['/api/v1/users/me/tips/sent'].get?.security).toEqual([{ bearerAuth: [] }]);
  });

  it('defines tip response schema with all required fields', () => {
    const getTip = openApiDocument.paths['/api/v1/tips/{id}'].get as Record<string, unknown>;
    const response200 = (getTip.responses as Record<string, unknown>)['200'] as Record<string, unknown>;
    const schema = (response200.content as Record<string, unknown>)['application/json'].schema as Record<string, unknown>;
    const dataSchema = (schema.properties as Record<string, unknown>).data as Record<string, unknown>;

    expect(dataSchema.properties).toHaveProperty('id');
    expect(dataSchema.properties).toHaveProperty('txHash');
    expect(dataSchema.properties).toHaveProperty('ledger');
    expect(dataSchema.properties).toHaveProperty('fromAddress');
    expect(dataSchema.properties).toHaveProperty('toAddress');
    expect(dataSchema.properties).toHaveProperty('amountStroops');
    expect(dataSchema.properties).toHaveProperty('status');
    expect(dataSchema.properties).toHaveProperty('createdAt');
  });
});
