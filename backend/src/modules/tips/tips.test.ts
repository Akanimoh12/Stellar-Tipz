import request from 'supertest';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { createApp } from '../../app.js';

const {
  mockGetAccount,
  mockSimulateTransaction,
  mockContractCall,
  mockFindMany,
  mockSendTransaction,
  mockGetTransaction,
  mockTipCreate,
} = vi.hoisted(() => ({
  mockGetAccount: vi.fn(),
  mockSimulateTransaction: vi.fn(),
  mockContractCall: vi.fn(),
  mockFindMany: vi.fn(),
  mockSendTransaction: vi.fn(),
  mockGetTransaction: vi.fn(),
  mockTipCreate: vi.fn(),
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
      create: mockTipCreate,
    },
    $disconnect: vi.fn(),
  },
}));

vi.mock('jsonwebtoken', () => ({
  default: {
    verify: vi.fn(() => ({
      sub: 'user-1',
      stellarAddress: 'GABCDEF123456789012345678901234567890123456789012345678901234',
    })),
  },
  verify: vi.fn(() => ({
    sub: 'user-1',
    stellarAddress: 'GABCDEF123456789012345678901234567890123456789012345678901234',
  })),
}));

const address = 'GF5YV3FQRHRMA7IQWCZKGRRJ5P7CEPIVBQLM4X2FEHS2IU57KF3U4CLN';

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
        message: 'Great content!',
      });
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

describe('POST /api/v1/tips/submit', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 400 when signedTxXdr is missing', async () => {
    const app = createApp();
    const res = await request(app)
      .post('/api/v1/tips/submit')
      .send({});
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('returns 400 when signedTxXdr is empty', async () => {
    const app = createApp();
    const res = await request(app)
      .post('/api/v1/tips/submit')
      .send({ signedTxXdr: '' });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('submits transaction, polls until confirmed, and records tip', async () => {
    mockSendTransaction.mockResolvedValue({
      status: 'PENDING',
      hash: 'mock-tx-hash',
    });
    mockGetTransaction
      .mockResolvedValueOnce({ status: 'NOT_FOUND' })
      .mockResolvedValueOnce({ status: 'SUCCESS', ledger: 12345 });
    mockTipCreate.mockResolvedValue({
      id: 'tip-1',
      txHash: 'mock-tx-hash',
      ledger: 12345,
      fromAddress: 'unknown',
      toAddress: 'unknown',
      amountStroops: BigInt(0),
      status: 'CONFIRMED',
    });

    const app = createApp();
    const res = await request(app)
      .post('/api/v1/tips/submit')
      .send({ signedTxXdr: 'AAAAAgAAAAA...mock-signed-xdr...' });
    expect(res.status).toBe(200);
    expect(res.body.data.txHash).toBeDefined();
    expect(res.body.data.tipId).toBeDefined();
    expect(res.body.data.status).toBe('CONFIRMED');
  });

  it('returns 400 when transaction submission fails', async () => {
    mockSendTransaction.mockRejectedValue(new Error('Network error'));

    const app = createApp();
    const res = await request(app)
      .post('/api/v1/tips/submit')
      .send({ signedTxXdr: 'AAAAAgAAAAA...mock-signed-xdr...' });
    expect(res.status).toBe(400);
  });

  it('polls and returns error when tx fails', async () => {
    mockSendTransaction.mockResolvedValue({
      status: 'PENDING',
      hash: 'mock-tx-hash',
    });
    mockGetTransaction
      .mockResolvedValueOnce({ status: 'NOT_FOUND' })
      .mockResolvedValueOnce({ status: 'FAILED' });

    const app = createApp();
    const res = await request(app)
      .post('/api/v1/tips/submit')
      .send({ signedTxXdr: 'AAAAAgAAAAA...mock-signed-xdr...' });
    expect(res.status).toBe(400);
  });
});

describe('GET /api/v1/tips', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns paginated tips', async () => {
    const now = new Date();
    mockFindMany.mockResolvedValue([
      {
        id: '1',
        txHash: 'hash-1',
        ledger: 100,
        fromAddress: address,
        toAddress: 'G' + 'X'.repeat(55),
        amountStroops: BigInt(100),
        message: 'Nice!',
        createdAt: now,
        updatedAt: now,
      },
      {
        id: '2',
        txHash: 'hash-2',
        ledger: 101,
        fromAddress: 'G' + 'Y'.repeat(55),
        toAddress: address,
        amountStroops: BigInt(200),
        message: null,
        createdAt: new Date(now.getTime() + 1000),
        updatedAt: new Date(now.getTime() + 1000),
      },
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
      {
        id: '3',
        txHash: 'hash-3',
        ledger: 102,
        fromAddress: address,
        toAddress: 'G' + 'Z'.repeat(55),
        amountStroops: BigInt(50),
        message: null,
        createdAt: now,
        updatedAt: now,
      },
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
