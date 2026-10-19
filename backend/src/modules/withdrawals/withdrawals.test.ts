import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp } from '../../app.js';
import { calculateWithdrawalFee } from './withdrawals.service.js';

const {
  mockFindMany,
  mockFindUnique,
  mockAggregate,
  mockGetAccount,
  mockSimulateTransaction,
  mockSendTransaction,
  mockFromXDR,
  mockWithdrawalFindUnique,
  mockWithdrawalCreate,
} = vi.hoisted(() => ({
  mockFindMany: vi.fn(),
  mockFindUnique: vi.fn(),
  mockAggregate: vi.fn(),
  mockGetAccount: vi.fn(),
  mockSimulateTransaction: vi.fn(),
  mockSendTransaction: vi.fn(),
  mockFromXDR: vi.fn(),
  mockWithdrawalFindUnique: vi.fn(),
  mockWithdrawalCreate: vi.fn(),
}));

vi.mock('../../db/prisma.js', () => ({
  prisma: {
    withdrawal: {
      findMany: mockFindMany,
      aggregate: mockAggregate,
      findUnique: mockWithdrawalFindUnique,
      create: mockWithdrawalCreate,
    },
    tip: { aggregate: mockAggregate },
    user: { findUnique: mockFindUnique },
    $disconnect: vi.fn(),
  },
}));

vi.mock('../../db/redis.js', () => ({
  redis: {
    zcount: vi.fn().mockResolvedValue(0),
    zadd: vi.fn().mockResolvedValue(1),
    expire: vi.fn().mockResolvedValue(1),
  },
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
    TransactionBuilder: Object.assign(
      vi.fn(() => ({
        addOperation: vi.fn(() => ({
          setTimeout: vi.fn(() => ({
            build: vi.fn(() => ({})),
          })),
        })),
      })),
      { fromXDR: mockFromXDR },
    ),
    SorobanRpc: {
      Server: vi.fn(() => ({
        getAccount: mockGetAccount,
        simulateTransaction: mockSimulateTransaction,
        sendTransaction: mockSendTransaction,
      })),
      assembleTransaction: vi.fn(() => mockPreparedTx),
      Api: { isSimulationError: vi.fn(() => false) },
    },
    Contract: vi.fn(() => ({ call: vi.fn() })),
    nativeToScVal: vi.fn(() => ({ type: 'scval' })),
    Networks: { TESTNET: 'Test SDF Network ; September 2015' },
  };
});

vi.mock('jsonwebtoken', () => ({
  default: { verify: vi.fn() },
}));

const jwt = await import('jsonwebtoken');
const address = 'GF5YV3FQRHRMA7IQWCZKGRRJ5P7CEPIVBQLM4X2FEHS2IU57KF3U4CLN';

function mockAuth(userId = 'user-1'): void {
  (jwt.default.verify as ReturnType<typeof vi.fn>).mockReturnValue({
    sub: userId,
    stellarAddress: address,
  });
}

describe('GET /api/v1/withdrawals/me', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 401 without an Authorization header', async () => {
    const app = createApp();
    const res = await request(app).get('/api/v1/withdrawals/me');
    expect(res.status).toBe(401);
  });

  it("returns the authenticated user's withdrawal history", async () => {
    mockAuth();
    mockFindMany.mockResolvedValue([
      {
        id: 'wd-1',
        amount: BigInt(1_000_000),
        fee: BigInt(1_000),
        txHash: 'tx-1',
        status: 'CONFIRMED',
        requestedAt: new Date('2024-01-01T00:00:00.000Z'),
        confirmedAt: new Date('2024-01-01T00:05:00.000Z'),
      },
    ]);

    const app = createApp();
    const res = await request(app)
      .get('/api/v1/withdrawals/me')
      .set('Authorization', 'Bearer valid-token');

    expect(res.status).toBe(200);
    expect(res.body.data[0]).toMatchObject({
      id: 'wd-1',
      amount: '1000000',
      fee: '1000',
      status: 'CONFIRMED',
    });
    expect(mockFindMany).toHaveBeenCalledWith({
      where: { userId: 'user-1' },
      orderBy: [{ requestedAt: 'desc' }, { id: 'desc' }],
      take: 21,
    });
    expect(res.body.nextCursor).toBeNull();
  });

  it('returns an empty array when the user has no withdrawals', async () => {
    mockAuth();
    mockFindMany.mockResolvedValue([]);

    const app = createApp();
    const res = await request(app)
      .get('/api/v1/withdrawals/me')
      .set('Authorization', 'Bearer valid-token');

    expect(res.status).toBe(200);
    expect(res.body.data).toEqual([]);
  });

  it('applies custom limit and offset from query params', async () => {
    mockAuth();
    mockFindMany.mockResolvedValue([]);

    const app = createApp();
    const res = await request(app)
      .get('/api/v1/withdrawals/me?limit=5&offset=10')
      .set('Authorization', 'Bearer valid-token');

    expect(res.status).toBe(200);
    expect(res.headers.deprecation).toMatch(/^@\d+$/);
    expect(mockFindMany).toHaveBeenCalledWith({
      where: { userId: 'user-1' },
      orderBy: [{ requestedAt: 'desc' }, { id: 'desc' }],
      skip: 10,
      take: 6,
    });
  });

  it('serializes null confirmedAt as null', async () => {
    mockAuth();
    mockFindMany.mockResolvedValue([
      {
        id: 'wd-2',
        amount: BigInt(500_000),
        fee: BigInt(10_000),
        txHash: null,
        status: 'PENDING',
        requestedAt: new Date('2024-06-01T00:00:00.000Z'),
        confirmedAt: null,
      },
    ]);

    const app = createApp();
    const res = await request(app)
      .get('/api/v1/withdrawals/me')
      .set('Authorization', 'Bearer valid-token');

    expect(res.status).toBe(200);
    expect(res.body.data[0].confirmedAt).toBeNull();
    expect(res.body.data[0].txHash).toBeNull();
  });
});

describe('GET /api/v1/balances/me', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns the withdrawable balance for the authenticated user', async () => {
    mockAuth();
    mockFindUnique.mockResolvedValue({ id: 'user-1', stellarAddress: address });
    mockAggregate
      .mockResolvedValueOnce({ _sum: { amountStroops: BigInt(5_000_000) } })
      .mockResolvedValueOnce({ _sum: { amount: BigInt(1_000_000) } });

    const app = createApp();
    const res = await request(app)
      .get('/api/v1/balances/me')
      .set('Authorization', 'Bearer valid-token');

    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({
      stellarAddress: address,
      totalReceived: '5000000',
      totalWithdrawn: '1000000',
      withdrawableBalance: '4000000',
    });
  });

  it('returns 401 without an Authorization header', async () => {
    const app = createApp();
    const res = await request(app).get('/api/v1/balances/me');
    expect(res.status).toBe(401);
  });

  it('returns zero balance when no tips received', async () => {
    mockAuth();
    mockFindUnique.mockResolvedValue({ id: 'user-1', stellarAddress: address });
    mockAggregate
      .mockResolvedValueOnce({ _sum: { amountStroops: null } })
      .mockResolvedValueOnce({ _sum: { amount: null } });

    const app = createApp();
    const res = await request(app)
      .get('/api/v1/balances/me')
      .set('Authorization', 'Bearer valid-token');

    expect(res.status).toBe(200);
    expect(res.body.data.withdrawableBalance).toBe('0');
  });
});

describe('POST /api/v1/withdrawals/prepare', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 400 for invalid amount', async () => {
    mockAuth();

    const app = createApp();
    const res = await request(app)
      .post('/api/v1/withdrawals/prepare')
      .set('Authorization', 'Bearer valid-token')
      .send({ amount: 'not-a-number' });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('returns 400 for empty body', async () => {
    mockAuth();

    const app = createApp();
    const res = await request(app)
      .post('/api/v1/withdrawals/prepare')
      .set('Authorization', 'Bearer valid-token')
      .send({});

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('returns 401 without an Authorization header', async () => {
    const app = createApp();
    const res = await request(app)
      .post('/api/v1/withdrawals/prepare')
      .send({ amount: '1000000' });

    expect(res.status).toBe(401);
  });

  it('returns prepared transaction on success', async () => {
    mockAuth();
    mockFindUnique.mockResolvedValue({ id: 'user-1', stellarAddress: address });
    mockAggregate
      .mockResolvedValueOnce({ _sum: { amountStroops: BigInt(5_000_000) } })
      .mockResolvedValueOnce({ _sum: { amount: BigInt(0) } });
    mockGetAccount.mockResolvedValue({});
    mockSimulateTransaction.mockResolvedValue({});

    const app = createApp();
    const res = await request(app)
      .post('/api/v1/withdrawals/prepare')
      .set('Authorization', 'Bearer valid-token')
      .send({ amount: '1000000' });

    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({
      unsignedTxXdr: 'AAAAAgAAAAA...mock-unsigned-xdr...',
      destination: address,
      amount: '1000000',
      fee: '20000',
      netAmount: '980000',
    });
  });

  it('returns 400 when amount exceeds withdrawable balance', async () => {
    mockAuth();
    mockFindUnique.mockResolvedValue({ id: 'user-1', stellarAddress: address });
    mockAggregate
      .mockResolvedValueOnce({ _sum: { amountStroops: BigInt(500_000) } })
      .mockResolvedValueOnce({ _sum: { amount: BigInt(0) } });

    const app = createApp();
    const res = await request(app)
      .post('/api/v1/withdrawals/prepare')
      .set('Authorization', 'Bearer valid-token')
      .send({ amount: '1000000' });

    expect(res.status).toBe(400);
  });
});

describe('POST /api/v1/withdrawals/submit (#940)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFromXDR.mockReturnValue({});
  });

  it('returns 400 when signedTxXdr is missing', async () => {
    mockAuth();

    const app = createApp();
    const res = await request(app)
      .post('/api/v1/withdrawals/submit')
      .set('Authorization', 'Bearer valid-token')
      .send({ amount: '1000000' });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('returns 401 without an Authorization header', async () => {
    const app = createApp();
    const res = await request(app)
      .post('/api/v1/withdrawals/submit')
      .send({ amount: '1000000', signedTxXdr: 'signed-xdr' });

    expect(res.status).toBe(401);
  });

  it('broadcasts the signed transaction and records a PENDING withdrawal', async () => {
    mockAuth();
    mockFindUnique.mockResolvedValue({ id: 'user-1', stellarAddress: address });
    mockAggregate
      .mockResolvedValueOnce({ _sum: { amountStroops: BigInt(5_000_000) } })
      .mockResolvedValueOnce({ _sum: { amount: BigInt(0) } });
    mockSendTransaction.mockResolvedValue({ status: 'PENDING', hash: 'submitted-tx-hash' });
    mockWithdrawalFindUnique.mockResolvedValue(null);
    mockWithdrawalCreate.mockResolvedValue({
      id: 'wd-1',
      txHash: 'submitted-tx-hash',
      status: 'PENDING',
      amount: BigInt(1_000_000),
      fee: BigInt(20_000),
    });

    const app = createApp();
    const res = await request(app)
      .post('/api/v1/withdrawals/submit')
      .set('Authorization', 'Bearer valid-token')
      .send({ amount: '1000000', signedTxXdr: 'signed-xdr' });

    expect(res.status).toBe(200);
    expect(mockSendTransaction).toHaveBeenCalledTimes(1);
    expect(mockWithdrawalCreate).toHaveBeenCalledWith({
      data: {
        userId: 'user-1',
        amount: BigInt(1_000_000),
        fee: BigInt(20_000),
        txHash: 'submitted-tx-hash',
        status: 'PENDING',
      },
    });
    expect(res.body.data).toMatchObject({
      id: 'wd-1',
      txHash: 'submitted-tx-hash',
      status: 'PENDING',
      amount: '1000000',
      fee: '20000',
      netAmount: '980000',
    });
  });

  it('returns 400 when the amount exceeds the withdrawable balance', async () => {
    mockAuth();
    mockFindUnique.mockResolvedValue({ id: 'user-1', stellarAddress: address });
    mockAggregate
      .mockResolvedValueOnce({ _sum: { amountStroops: BigInt(1_000) } })
      .mockResolvedValueOnce({ _sum: { amount: BigInt(0) } });

    const app = createApp();
    const res = await request(app)
      .post('/api/v1/withdrawals/submit')
      .set('Authorization', 'Bearer valid-token')
      .send({ amount: '1000000', signedTxXdr: 'signed-xdr' });

    expect(res.status).toBe(400);
    expect(mockSendTransaction).not.toHaveBeenCalled();
  });

  it('returns 400 when the network rejects the transaction', async () => {
    mockAuth();
    mockFindUnique.mockResolvedValue({ id: 'user-1', stellarAddress: address });
    mockAggregate
      .mockResolvedValueOnce({ _sum: { amountStroops: BigInt(5_000_000) } })
      .mockResolvedValueOnce({ _sum: { amount: BigInt(0) } });
    mockSendTransaction.mockResolvedValue({ status: 'ERROR', hash: 'rejected-tx-hash' });

    const app = createApp();
    const res = await request(app)
      .post('/api/v1/withdrawals/submit')
      .set('Authorization', 'Bearer valid-token')
      .send({ amount: '1000000', signedTxXdr: 'signed-xdr' });

    expect(res.status).toBe(400);
    expect(mockWithdrawalCreate).not.toHaveBeenCalled();
  });

  it('is idempotent — resubmitting a txHash that already exists returns the existing withdrawal', async () => {
    mockAuth();
    mockFindUnique.mockResolvedValue({ id: 'user-1', stellarAddress: address });
    mockAggregate
      .mockResolvedValueOnce({ _sum: { amountStroops: BigInt(5_000_000) } })
      .mockResolvedValueOnce({ _sum: { amount: BigInt(0) } });
    mockSendTransaction.mockResolvedValue({ status: 'DUPLICATE', hash: 'existing-tx-hash' });
    mockWithdrawalFindUnique.mockResolvedValue({
      id: 'wd-existing',
      txHash: 'existing-tx-hash',
      status: 'PENDING',
      amount: BigInt(1_000_000),
      fee: BigInt(20_000),
    });

    const app = createApp();
    const res = await request(app)
      .post('/api/v1/withdrawals/submit')
      .set('Authorization', 'Bearer valid-token')
      .send({ amount: '1000000', signedTxXdr: 'signed-xdr' });

    expect(res.status).toBe(200);
    expect(res.body.data.id).toBe('wd-existing');
    expect(mockWithdrawalCreate).not.toHaveBeenCalled();
  });
});

describe('calculateWithdrawalFee', () => {
  it('charges a 2% fee (the default rate) rounded down', () => {
    expect(calculateWithdrawalFee(BigInt(1_000_000), 200)).toEqual({
      fee: BigInt(20_000),
      netAmount: BigInt(980_000),
    });
  });

  it('floors the fee instead of rounding up', () => {
    expect(calculateWithdrawalFee(BigInt(999), 200)).toEqual({
      fee: BigInt(19),
      netAmount: BigInt(980),
    });
  });

  it('supports a zero fee rate', () => {
    expect(calculateWithdrawalFee(BigInt(1_000_000), 0)).toEqual({
      fee: BigInt(0),
      netAmount: BigInt(1_000_000),
    });
  });

  it('throws for a zero or negative amount', () => {
    expect(() => calculateWithdrawalFee(BigInt(0), 200)).toThrow('Withdrawal amount must be positive');
    expect(() => calculateWithdrawalFee(BigInt(-1), 200)).toThrow('Withdrawal amount must be positive');
  });
});
