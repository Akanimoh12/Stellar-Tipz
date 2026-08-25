import request from 'supertest';
import jwt from 'jsonwebtoken';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { createApp } from '../../app.js';
import { openApiDocument } from '../../docs/openapi.js';

const {
  mockGetAccount,
  mockSimulateTransaction,
  mockSendTransaction,
  mockGetTransaction,
  mockContractCall,
  mockFindMany,
  mockFindUnique,
  mockCreate,
  mockUpdate,
  mockGroupBy,
  mockFindUniqueUser,
  mockEmitBalanceUpdated,
  mockGetWithdrawableBalance,
  mockCreateNotification,
  mockEmitLeaderboardUpdated,
  mockGetUserRank,
} = vi.hoisted(() => ({
  mockGetAccount: vi.fn(),
  mockSimulateTransaction: vi.fn(),
  mockSendTransaction: vi.fn(),
  mockGetTransaction: vi.fn(),
  mockContractCall: vi.fn(),
  mockFindMany: vi.fn(),
  mockFindUnique: vi.fn(),
  mockCreate: vi.fn(),
  mockUpdate: vi.fn(),
  mockGroupBy: vi.fn(),
  mockFindUniqueUser: vi.fn(),
  mockEmitBalanceUpdated: vi.fn(),
  mockGetWithdrawableBalance: vi.fn(),
  mockCreateNotification: vi.fn(),
  mockEmitLeaderboardUpdated: vi.fn(),
  mockGetUserRank: vi.fn(),
}));

vi.mock('../../realtime/index.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../realtime/index.js')>();
  return {
    ...actual,
    emitBalanceUpdated: mockEmitBalanceUpdated,
    emitLeaderboardUpdated: mockEmitLeaderboardUpdated,
  };
});

vi.mock('../withdrawals/withdrawals.service.js', () => ({
  getWithdrawableBalance: mockGetWithdrawableBalance,
}));

vi.mock('../leaderboard/leaderboard.service.js', () => ({
  getUserRank: mockGetUserRank,
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
      groupBy: mockGroupBy,
    },
    user: {
      findUnique: mockFindUniqueUser,
    },
    $disconnect: vi.fn(),
  },
}));

vi.mock('../notifications/notifications.service.js', () => ({
  createNotification: mockCreateNotification,
}));

// ── Helpers ────────────────────────────────────────────────────────────────

const now = new Date('2026-06-29T00:00:00.000Z');
const from = 'GF5YV3FQRHRMA7IQWCZKGRRJ5P7CEPIVBQLM4X2FEHS2IU57KF3U4CLN';
const to   = 'GCEZWKCA5VLDNRLN3RPRJMRZOX3Z6G5CHCGBFMF5CKFHGZXABSZLAZP2';
const address = from;

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

  it('notifies the receiving creator when they have an off-chain account', async () => {
    mockFindUnique.mockResolvedValue(null);
    mockCreate.mockResolvedValue(tipRow);
    mockFindUniqueUser.mockResolvedValue({ id: 'user-to' });

    const app = createApp();
    const res = await request(app).post('/api/v1/tips').send(validBody);

    expect(res.status).toBe(200);
    expect(mockFindUniqueUser).toHaveBeenCalledWith({ where: { stellarAddress: to } });
    expect(mockCreateNotification).toHaveBeenCalledWith(
      'user-to',
      'tip_received',
      expect.objectContaining({ tipId: tipRow.id, from, amountStroops: '1000000' }),
    );
  });

  it('skips notifying when the recipient has no off-chain account', async () => {
    mockFindUnique.mockResolvedValue(null);
    mockCreate.mockResolvedValue(tipRow);
    mockFindUniqueUser.mockResolvedValue(null);

    const app = createApp();
    const res = await request(app).post('/api/v1/tips').send(validBody);

    expect(res.status).toBe(200);
    expect(mockCreateNotification).not.toHaveBeenCalled();
  });

  it('skips notifying for a self-tip', async () => {
    mockFindUnique.mockResolvedValue(null);
    mockCreate.mockResolvedValue(makeTipRow({ fromAddress: to }));

    const app = createApp();
    const res = await request(app)
      .post('/api/v1/tips')
      .send({ ...validBody, fromAddress: to });

    expect(res.status).toBe(200);
    expect(mockFindUniqueUser).not.toHaveBeenCalled();
    expect(mockCreateNotification).not.toHaveBeenCalled();
  });

  it('does not fail the request when notifying the creator throws', async () => {
    mockFindUnique.mockResolvedValue(null);
    mockCreate.mockResolvedValue(tipRow);
    mockFindUniqueUser.mockResolvedValue({ id: 'user-to' });
    mockCreateNotification.mockRejectedValue(new Error('boom'));

    const app = createApp();
    const res = await request(app).post('/api/v1/tips').send(validBody);

    expect(res.status).toBe(200);
    expect(res.body.data.txHash).toBe('abc123txhash');
  });

  it('returns the existing tip without a duplicate insert when txHash already exists', async () => {
    mockFindUnique.mockResolvedValue(tipRow);

    const app = createApp();
    const res = await request(app).post('/api/v1/tips').send(validBody);
    expect(res.status).toBe(200);
    expect(res.body.data.txHash).toBe('abc123txhash');
    expect(mockCreate).not.toHaveBeenCalled();
    expect(mockCreateNotification).not.toHaveBeenCalled();
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

  it('emits balance.updated for the recipient after confirming (#951)', async () => {
    mockFindUnique.mockResolvedValue(pendingRow);
    mockUpdate.mockResolvedValue(confirmedRow);
    mockFindUniqueUser.mockResolvedValue({ id: 'user-1', stellarAddress: to });
    mockGetWithdrawableBalance.mockResolvedValue({
      stellarAddress: to,
      totalReceived: '1000000',
      totalWithdrawn: '0',
      withdrawableBalance: '1000000',
    });

    const app = createApp();
    const res = await request(app).patch(`/api/v1/tips/${txHash}/confirm`);

    expect(res.status).toBe(200);
    expect(mockFindUniqueUser).toHaveBeenCalledWith({ where: { stellarAddress: to } });
    expect(mockGetWithdrawableBalance).toHaveBeenCalledWith('user-1');
    expect(mockEmitBalanceUpdated).toHaveBeenCalledWith({
      userId: 'user-1',
      stellarAddress: to,
      totalReceived: '1000000',
      totalWithdrawn: '0',
      withdrawableBalance: '1000000',
    });
  });

  it('does not emit balance.updated when the recipient has no account', async () => {
    mockFindUnique.mockResolvedValue(pendingRow);
    mockUpdate.mockResolvedValue(confirmedRow);
    mockFindUniqueUser.mockResolvedValue(null);

    const app = createApp();
    const res = await request(app).patch(`/api/v1/tips/${txHash}/confirm`);

    expect(res.status).toBe(200);
    expect(mockGetWithdrawableBalance).not.toHaveBeenCalled();
    expect(mockEmitBalanceUpdated).not.toHaveBeenCalled();
  });

  it('emits leaderboard.updated for the recipient after confirming (#952)', async () => {
    mockFindUnique.mockResolvedValue(pendingRow);
    mockUpdate.mockResolvedValue(confirmedRow);
    mockFindUniqueUser.mockResolvedValue({ id: 'user-1', stellarAddress: to });
    mockGetWithdrawableBalance.mockResolvedValue({
      stellarAddress: to,
      totalReceived: '1000000',
      totalWithdrawn: '0',
      withdrawableBalance: '1000000',
    });
    mockGetUserRank.mockResolvedValue({ rank: 3, totalTips: '1000000', window: 'all' });

    const app = createApp();
    const res = await request(app).patch(`/api/v1/tips/${txHash}/confirm`);

    expect(res.status).toBe(200);
    expect(mockGetUserRank).toHaveBeenCalledWith('user-1', 'all');
    expect(mockEmitLeaderboardUpdated).toHaveBeenCalledWith({
      window: 'all',
      entry: {
        rank: 3,
        userId: 'user-1',
        stellarAddress: to,
        totalTips: '1000000',
      },
    });
  });

  it('does not fail the request when getUserRank throws', async () => {
    mockFindUnique.mockResolvedValue(pendingRow);
    mockUpdate.mockResolvedValue(confirmedRow);
    mockFindUniqueUser.mockResolvedValue({ id: 'user-1', stellarAddress: to });
    mockGetWithdrawableBalance.mockResolvedValue({
      stellarAddress: to,
      totalReceived: '1000000',
      totalWithdrawn: '0',
      withdrawableBalance: '1000000',
    });
    mockGetUserRank.mockRejectedValue(new Error('not ranked yet'));

    const app = createApp();
    const res = await request(app).patch(`/api/v1/tips/${txHash}/confirm`);

    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('CONFIRMED');
    expect(mockEmitLeaderboardUpdated).not.toHaveBeenCalled();
    expect(mockEmitBalanceUpdated).toHaveBeenCalledTimes(1);
  });
});

// ── GET /api/v1/tips/:txHash/receipt ───────────────────────────────────────

describe('GET /api/v1/tips/:txHash/receipt', () => {
  const txHash = 'abc123txhash';
  const thirdParty = 'GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA3';

  function signToken(stellarAddress: string): string {
    return jwt.sign({ sub: 'user-id', stellarAddress }, process.env.JWT_SECRET!);
  }

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns a receipt when the sender requests it', async () => {
    mockFindUnique.mockResolvedValue(makeTipRow());
    const token = signToken(from);

    const app = createApp();
    const res = await request(app)
      .get(`/api/v1/tips/${txHash}/receipt`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.data.txHash).toBe(txHash);
    expect(res.body.data.amountStroops).toBe('1000000');
    expect(res.body.data.feeStroops).toBe('0');
    expect(res.body.data.tokenCode).toBe('XLM');
    expect(res.body.data.fromAddress).toBe(from);
    expect(res.body.data.toAddress).toBe(to);
    expect(res.body.data.ledger).toBe(100);
    expect(res.body.data.createdAt).toBe(now.toISOString());
    expect(res.body.data.explorerUrl).toContain(txHash);
    expect(res.body.data.explorerUrl).toMatch(/^https:\/\/stellar\.expert\/explorer\//);
  });

  it('returns a receipt when the recipient requests it', async () => {
    mockFindUnique.mockResolvedValue(makeTipRow());
    const token = signToken(to);

    const app = createApp();
    const res = await request(app)
      .get(`/api/v1/tips/${txHash}/receipt`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.data.txHash).toBe(txHash);
  });

  it('returns 403 when a third party requests it', async () => {
    mockFindUnique.mockResolvedValue(makeTipRow());
    const token = signToken(thirdParty);

    const app = createApp();
    const res = await request(app)
      .get(`/api/v1/tips/${txHash}/receipt`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('FORBIDDEN');
  });

  it('returns 404 when the tip does not exist', async () => {
    mockFindUnique.mockResolvedValue(null);
    const token = signToken(from);

    const app = createApp();
    const res = await request(app)
      .get('/api/v1/tips/nonexistent/receipt')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
  });

  it('returns 401 when no auth token is provided', async () => {
    const app = createApp();
    const res = await request(app).get(`/api/v1/tips/${txHash}/receipt`);

    expect(res.status).toBe(401);
  });

  it('returns 404 for anonymous tips when caller is not sender or recipient', async () => {
    mockFindUnique.mockResolvedValue(makeTipRow({ isAnonymous: true }));
    const token = signToken(thirdParty);

    const app = createApp();
    const res = await request(app)
      .get(`/api/v1/tips/${txHash}/receipt`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
  });

  it('returns receipt for anonymous tip when caller is the sender', async () => {
    mockFindUnique.mockResolvedValue(makeTipRow({ isAnonymous: true }));
    const token = signToken(from);

    const app = createApp();
    const res = await request(app)
      .get(`/api/v1/tips/${txHash}/receipt`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.data.txHash).toBe(txHash);
  });

  it('returns receipt for anonymous tip when caller is the recipient', async () => {
    mockFindUnique.mockResolvedValue(makeTipRow({ isAnonymous: true }));
    const token = signToken(to);

    const app = createApp();
    const res = await request(app)
      .get(`/api/v1/tips/${txHash}/receipt`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.data.txHash).toBe(txHash);
  });

  it('includes explorer URL with correct network path', async () => {
    mockFindUnique.mockResolvedValue(makeTipRow());
    const token = signToken(from);

    const app = createApp();
    const res = await request(app)
      .get(`/api/v1/tips/${txHash}/receipt`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.data.explorerUrl).toBe(`https://stellar.expert/explorer/testnet/tx/${txHash}`);
  });
});

// ── OpenAPI docs registration ───────────────────────────────────────────────

describe('OpenAPI docs - Tips module', () => {
  it('registers GET /api/v1/tips endpoint', () => {
    const getOp = openApiDocument.paths['/api/v1/tips']?.get as Record<string, unknown> | undefined;
    expect(getOp).toBeDefined();
    expect((getOp?.tags as string[]) ?? []).toContain('Tips');
    expect(getOp?.summary).toBe('List tips with optional filtering');
  });

  it('registers POST /api/v1/tips endpoint', () => {
    const postOp = openApiDocument.paths['/api/v1/tips']?.post as Record<string, unknown> | undefined;
    expect(postOp).toBeDefined();
    expect((postOp?.tags as string[]) ?? []).toContain('Tips');
    expect(postOp?.summary).toBe('Record an on-chain tip');
  });

  it('registers POST /api/v1/tips/prepare endpoint', () => {
    const postOp = openApiDocument.paths['/api/v1/tips/prepare']?.post as Record<string, unknown> | undefined;
    expect(postOp).toBeDefined();
    expect((postOp?.tags as string[]) ?? []).toContain('Tips');
    expect(postOp?.summary).toBe('Prepare an unsigned Soroban tip transaction');
  });

  it('registers GET /api/v1/tips/:id endpoint', () => {
    const getOp = openApiDocument.paths['/api/v1/tips/{id}']?.get as Record<string, unknown> | undefined;
    expect(getOp).toBeDefined();
    expect((getOp?.tags as string[]) ?? []).toContain('Tips');
    expect(getOp?.summary).toBe('Get a single tip by id');
  });

  it('registers PATCH /api/v1/tips/:txHash/confirm endpoint', () => {
    const patchOp = openApiDocument.paths['/api/v1/tips/{txHash}/confirm']?.patch as Record<string, unknown> | undefined;
    expect(patchOp).toBeDefined();
    expect((patchOp?.tags as string[]) ?? []).toContain('Tips');
    expect(patchOp?.summary).toBe('Confirm a pending tip');
  });

  it('registers GET /api/v1/tips/:txHash/receipt endpoint', () => {
    const getOp = openApiDocument.paths['/api/v1/tips/{txHash}/receipt']?.get as Record<string, unknown> | undefined;
    expect(getOp).toBeDefined();
    expect((getOp?.tags as string[]) ?? []).toContain('Tips');
    expect(getOp?.summary).toBe('Get a structured tip receipt');
    expect((getOp?.security as Record<string, string[]>[]) ?? []).toEqual([{ bearerAuth: [] }]);
  });

  it('registers profile tips endpoint at /api/v1/profiles/:username/tips', () => {
    const getOp = openApiDocument.paths['/api/v1/profiles/{username}/tips']?.get as Record<string, unknown> | undefined;
    expect(getOp).toBeDefined();
    expect((getOp?.tags as string[]) ?? []).toContain('Tips');
    expect(getOp?.summary).toBe('List tips received by a profile');
  });

  it('registers user-sent tips endpoint at /api/v1/users/me/tips/sent', () => {
    const getOp = openApiDocument.paths['/api/v1/users/me/tips/sent']?.get as Record<string, unknown> | undefined;
    expect(getOp).toBeDefined();
    expect((getOp?.tags as string[]) ?? []).toContain('Tips');
    expect((getOp?.security as Record<string, string[]>[]) ?? []).toEqual([{ bearerAuth: [] }]);
  });

  it('defines tip response schema with all required fields', () => {
    const getTip = openApiDocument.paths['/api/v1/tips/{id}'].get as Record<string, unknown> | undefined;
    const responses = getTip?.responses as Record<string, unknown> | undefined;
    const response200 = responses?.['200'] as Record<string, unknown> | undefined;
    const content = response200?.content as Record<string, unknown> | undefined;
    const schema = content?.['application/json'] as Record<string, unknown> | undefined;
    const dataSchema = (schema as Record<string, unknown>)?.data as Record<string, unknown> | undefined;

    expect((dataSchema as Record<string, unknown>)?.properties).toHaveProperty('id');
    expect((dataSchema as Record<string, unknown>)?.properties).toHaveProperty('txHash');
    expect((dataSchema as Record<string, unknown>)?.properties).toHaveProperty('ledger');
    expect((dataSchema as Record<string, unknown>)?.properties).toHaveProperty('fromAddress');
    expect((dataSchema as Record<string, unknown>)?.properties).toHaveProperty('toAddress');
    expect((dataSchema as Record<string, unknown>)?.properties).toHaveProperty('amountStroops');
    expect((dataSchema as Record<string, unknown>)?.properties).toHaveProperty('status');
    expect((dataSchema as Record<string, unknown>)?.properties).toHaveProperty('createdAt');
  });
});
