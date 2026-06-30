import request from 'supertest';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { createApp } from '../../app.js';

const {
  mockGetAccount,
  mockSimulateTransaction,
  mockContractCall,
  mockFindMany,
  mockFindUnique,
  mockCreate,
  mockUpdate,
} = vi.hoisted(() => ({
  mockGetAccount: vi.fn(),
  mockSimulateTransaction: vi.fn(),
  mockContractCall: vi.fn(),
  mockFindMany: vi.fn(),
  mockFindUnique: vi.fn(),
  mockCreate: vi.fn(),
  mockUpdate: vi.fn(),
}));

vi.mock('@stellar/stellar-sdk', () => {
  const mockPreparedTx = {
    build: vi.fn(() => ({
      toEnvelope: vi.fn(() => ({
        toXDR: vi.fn(() => 'AAAAAgAAAAA...mock-unsigned-xdr...'),
        hash: vi.fn(() => Buffer.from('abcdef1234567890abcdef1234567890abcdef12', 'hex')),
      })),
    })),
  };

  const mockTx = {
    toEnvelope: vi.fn(() => ({
      toXDR: vi.fn(() => 'AAAAAgAAAAA...mock-unsigned-xdr...'),
      hash: vi.fn(() => Buffer.from('abcdef1234567890abcdef1234567890abcdef12', 'hex')),
    })),
  };

  return {
    Keypair: {
      fromPublicKey: vi.fn(),
    },
    TransactionBuilder: Object.assign(
      vi.fn(() => ({
        addOperation: vi.fn(() => ({
          setTimeout: vi.fn(() => ({
            build: vi.fn(() => ({})),
          })),
        })),
      })),
      { fromXDR: vi.fn(() => mockTx) },
    ),
    SorobanRpc: {
      Server: vi.fn(() => ({
        getAccount: mockGetAccount,
        simulateTransaction: mockSimulateTransaction,
        sendTransaction: mockSendTransaction,
        getTransaction: mockGetTransaction,
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
      TransactionEnvelope: {
        fromXDR: vi.fn(() => ({
          hash: vi.fn(() => Buffer.from('abcdef1234567890abcdef1234567890abcdef12', 'hex')),
        })),
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
    mockFindUnique.mockResolvedValue(null);
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

  it('sanitizes HTML-like characters in message', async () => {
    mockGetAccount.mockResolvedValue({
      accountId: () => address,
      sequenceNumber: () => '123',
      incrementSequenceNumber: () => {},
    });
    mockSimulateTransaction.mockResolvedValue({});

    const app = createApp();
    const res = await request(app)
      .post('/api/v1/tips/prepare')
      .send({
        from: address,
        to: address,
        amount: '100',
        message: '<script>alert("xss")</script>',
      });
    expect(res.status).toBe(200);
  });

  it('rejects message with invalid characters', async () => {
    const app = createApp();
    const res = await request(app)
      .post('/api/v1/tips/prepare')
      .send({
        from: address,
        to: address,
        amount: '100',
        message: 'message with \u0000 null byte',
      });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('rejects message longer than 280 characters', async () => {
    const app = createApp();
    const res = await request(app)
      .post('/api/v1/tips/prepare')
      .send({
        from: address,
        to: address,
        amount: '100',
        message: 'x'.repeat(281),
      });
    expect(res.status).toBe(400);
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

  it('filters by tokenCode', async () => {
    mockFindMany.mockResolvedValue([
      {
        id: '4',
        txHash: 'hash-4',
        ledger: 103,
        fromAddress: address,
        toAddress: 'G' + 'Z'.repeat(55),
        amountStroops: BigInt(75),
        tokenCode: 'USDC',
        message: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ]);

    const app = createApp();
    const res = await request(app).get('/api/v1/tips?tokenCode=USDC');
    expect(res.status).toBe(200);
    expect(mockFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ tokenCode: 'USDC' }),
      }),
    );
  });

  it('filters by startDate', async () => {
    mockFindMany.mockResolvedValue([]);

    const app = createApp();
    const res = await request(app).get('/api/v1/tips?startDate=2026-01-01T00:00:00Z');
    expect(res.status).toBe(200);
    expect(mockFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          createdAt: expect.objectContaining({ gte: expect.any(Date) }),
        }),
      }),
    );
  });

  it('filters by endDate', async () => {
    mockFindMany.mockResolvedValue([]);

    const app = createApp();
    const res = await request(app).get('/api/v1/tips?endDate=2026-06-30T23:59:59Z');
    expect(res.status).toBe(200);
    expect(mockFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          createdAt: expect.objectContaining({ lte: expect.any(Date) }),
        }),
      }),
    );
  });

  it('filters by both startDate and endDate', async () => {
    mockFindMany.mockResolvedValue([]);

    const app = createApp();
    const res = await request(app).get(
      '/api/v1/tips?startDate=2026-01-01T00:00:00Z&endDate=2026-06-30T23:59:59Z',
    );
    expect(res.status).toBe(200);
    expect(mockFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          createdAt: expect.objectContaining({
            gte: expect.any(Date),
            lte: expect.any(Date),
          }),
        }),
      }),
    );
  });

  it('returns 400 for invalid startDate format', async () => {
    const app = createApp();
    const res = await request(app).get('/api/v1/tips?startDate=not-a-date');
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });
});

describe('POST /api/v1/tips/prepare — minimum tip enforcement', () => {
  function mockCreator(minTipAmount: bigint | null) {
    mockFindUnique.mockResolvedValue({
      id: 'creator-1',
      stellarAddress: address,
      minTipAmount,
      username: 'creator',
      displayName: null,
      bio: null,
      imageUrl: null,
      avatarCid: null,
      xHandle: null,
      creditScore: null,
      creditTier: null,
      deletedAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
  }

  function mockStellar() {
    mockGetAccount.mockResolvedValue({
      accountId: () => address,
      sequenceNumber: () => '123',
      incrementSequenceNumber: () => {},
    });
    mockSimulateTransaction.mockResolvedValue({});
  }

  it('returns 400 when tip is below creator minimum', async () => {
    mockStellar();
    mockCreator(BigInt(500));

    const app = createApp();
    const res = await request(app)
      .post('/api/v1/tips/prepare')
      .send({ from: address, to: address, amount: '100' });
    expect(res.status).toBe(400);
    expect(res.body.error.message).toContain('below the creator\'s minimum');
  });

  it('allows tip when creator has no minimum set', async () => {
    mockStellar();
    mockCreator(null);

    const app = createApp();
    const res = await request(app)
      .post('/api/v1/tips/prepare')
      .send({ from: address, to: address, amount: '100' });
    expect(res.status).toBe(200);
  });

  it('allows tip when creator does not exist in off-chain DB', async () => {
    mockStellar();
    mockFindUnique.mockResolvedValue(null);

    const app = createApp();
    const res = await request(app)
      .post('/api/v1/tips/prepare')
      .send({ from: address, to: address, amount: '100' });
    expect(res.status).toBe(200);
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
