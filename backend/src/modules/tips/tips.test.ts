import request from 'supertest';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { createApp } from '../../app.js';

const { mockGetAccount, mockSimulateTransaction, mockContractCall, mockFindMany, mockFindUnique, mockCreate } = vi.hoisted(() => ({
  mockGetAccount: vi.fn(),
  mockSimulateTransaction: vi.fn(),
  mockContractCall: vi.fn(),
  mockFindMany: vi.fn(),
  mockFindUnique: vi.fn(),
  mockCreate: vi.fn(),
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
    },
    $disconnect: vi.fn(),
  },
}));

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
      accountId: () => 'GF5YV3FQRHRMA7IQWCZKGRRJ5P7CEPIVBQLM4X2FEHS2IU57KF3U4CLN',
      sequenceNumber: () => '123',
      incrementSequenceNumber: () => {},
    });
    mockSimulateTransaction.mockResolvedValue({});

    const app = createApp();
    const res = await request(app)
      .post('/api/v1/tips/prepare')
      .send({
        from: 'GF5YV3FQRHRMA7IQWCZKGRRJ5P7CEPIVBQLM4X2FEHS2IU57KF3U4CLN',
        to: 'GF5YV3FQRHRMA7IQWCZKGRRJ5P7CEPIVBQLM4X2FEHS2IU57KF3U4CLN',
        amount: '100',
        message: 'Great content!',
      });
    expect(res.status).toBe(200);
    expect(res.body.data.unsignedTxXdr).toBeDefined();
    expect(res.body.data.contractId).toBeDefined();
  });
});

describe('GET /api/v1/tips', () => {
  const address = 'GF5YV3FQRHRMA7IQWCZKGRRJ5P7CEPIVBQLM4X2FEHS2IU57KF3U4CLN';

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns paginated tips', async () => {
    const now = new Date();
    mockFindMany.mockResolvedValue([
      { id: '1', txHash: 'hash-1', ledger: 100, fromAddress: address, toAddress: 'G' + 'X'.repeat(55), amountStroops: BigInt(100), message: 'Nice!', createdAt: now, updatedAt: now },
      { id: '2', txHash: 'hash-2', ledger: 101, fromAddress: 'G' + 'Y'.repeat(55), toAddress: address, amountStroops: BigInt(200), message: null, createdAt: new Date(now.getTime() + 1000), updatedAt: new Date(now.getTime() + 1000) },
    ]);

    const app = createApp();
    const res = await request(app).get('/api/v1/tips');
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(2);
    expect(res.body.data[0].amountStroops).toBe('100');
    expect(res.body.data[1].amountStroops).toBe('200');
    expect(res.body.nextCursor).toBeNull();
  });

  it('includes nextCursor when there are more results', async () => {
    mockFindMany.mockResolvedValue(
      Array.from({ length: 21 }, (_, i) => ({
        id: `${i + 1}`,
        txHash: `hash-${i + 1}`,
        ledger: 100 + i,
        fromAddress: address,
        toAddress: 'G' + 'X'.repeat(55),
        amountStroops: BigInt((i + 1) * 10),
        message: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      })),
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
    const now = new Date();
    mockFindMany.mockResolvedValue([
      { id: '3', txHash: 'hash-3', ledger: 102, fromAddress: address, toAddress: 'G' + 'Z'.repeat(55), amountStroops: BigInt(50), message: null, createdAt: now, updatedAt: now },
    ]);

    const app = createApp();
    const res = await request(app).get(`/api/v1/tips?address=${address}`);
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].amountStroops).toBe('50');
  });

  it('filters by direction=sent', async () => {
    mockFindMany.mockResolvedValue([]);

    const app = createApp();
    const res = await request(app).get(`/api/v1/tips?address=${address}&direction=sent`);
    expect(res.status).toBe(200);
    expect(mockFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ fromAddress: { equals: address, mode: 'insensitive' } }),
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

describe('POST /api/v1/tips — dedupe by txHash', () => {
  const from = 'GF5YV3FQRHRMA7IQWCZKGRRJ5P7CEPIVBQLM4X2FEHS2IU57KF3U4CLN';
  const to   = 'GCEZWKCA5VLDNRLN3RPRJMRZOX3Z6G5CHCGBFMF5CKFHGZXABSZLAZP2';
  const validBody = {
    txHash: 'abc123txhash',
    ledger: 100,
    fromAddress: from,
    toAddress: to,
    amountStroops: '1000000',
    message: 'Great work!',
  };
  const tipRow = {
    id: 'clh1234567890',
    txHash: 'abc123txhash',
    ledger: 100,
    fromAddress: from,
    toAddress: to,
    amountStroops: BigInt(1_000_000),
    message: 'Great work!',
    createdAt: new Date(),
    updatedAt: new Date(),
  };

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
    expect(mockCreate).toHaveBeenCalledTimes(1);
  });

  it('returns the existing tip and does NOT insert a duplicate when txHash already exists', async () => {
    mockFindUnique.mockResolvedValue(tipRow);

    const app = createApp();
    const res = await request(app).post('/api/v1/tips').send(validBody);
    expect(res.status).toBe(200);
    expect(res.body.data.txHash).toBe('abc123txhash');
    // create must not be called — the duplicate was caught by the pre-check
    expect(mockCreate).not.toHaveBeenCalled();
  });
});
