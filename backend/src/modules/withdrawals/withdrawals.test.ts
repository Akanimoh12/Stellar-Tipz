import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp } from '../../app.js';

const { mockFindMany, mockFindUnique, mockAggregate, mockGetAccount, mockSimulateTransaction } =
  vi.hoisted(() => ({
    mockFindMany: vi.fn(),
    mockFindUnique: vi.fn(),
    mockAggregate: vi.fn(),
    mockGetAccount: vi.fn(),
    mockSimulateTransaction: vi.fn(),
  }));

vi.mock('../../db/prisma.js', () => ({
  prisma: {
    withdrawal: {
      findMany: mockFindMany,
      aggregate: mockAggregate,
    },
    tip: { aggregate: mockAggregate },
    user: { findUnique: mockFindUnique },
    $disconnect: vi.fn(),
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
      orderBy: { requestedAt: 'desc' },
      skip: 0,
      take: 20,
    });
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
    });
  });
});
