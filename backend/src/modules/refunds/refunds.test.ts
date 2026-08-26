import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp } from '../../app.js';

const {
  mockUserFindUnique,
  mockTipFindUnique,
  mockRefundFindUnique,
  mockRefundFindMany,
  mockRefundCreate,
  mockRefundUpdate,
  mockGetAccount,
  mockSimulateTransaction,
  mockSendTransaction,
} =
  vi.hoisted(() => ({
    mockUserFindUnique: vi.fn(),
    mockTipFindUnique: vi.fn(),
    mockRefundFindUnique: vi.fn(),
    mockRefundFindMany: vi.fn(),
    mockRefundCreate: vi.fn(),
    mockRefundUpdate: vi.fn(),
    mockGetAccount: vi.fn(),
    mockSimulateTransaction: vi.fn(),
    mockSendTransaction: vi.fn(),
  }));

vi.mock('../../db/prisma.js', () => ({
  prisma: {
    user: { findUnique: mockUserFindUnique },
    tip: { findUnique: mockTipFindUnique },
    refund: {
      findUnique: mockRefundFindUnique,
      findMany: mockRefundFindMany,
      create: mockRefundCreate,
      update: mockRefundUpdate,
    },
    $disconnect: vi.fn(),
  },
}));

vi.mock('@stellar/stellar-sdk', () => ({
  Contract: vi.fn().mockImplementation(() => ({
    call: vi.fn().mockReturnValue({ type: 'operation' }),
  })),
  TransactionBuilder: Object.assign(
    vi.fn().mockImplementation(() => ({
      addOperation: vi.fn().mockReturnThis(),
      setTimeout: vi.fn().mockReturnThis(),
      build: vi.fn().mockReturnValue({ type: 'tx' }),
    })),
    {
      fromXDR: vi.fn().mockReturnValue({ type: 'signed-tx' }),
    },
  ),
  SorobanRpc: {
    Server: vi.fn().mockImplementation(() => ({
      getAccount: mockGetAccount,
      simulateTransaction: mockSimulateTransaction,
      sendTransaction: mockSendTransaction,
    })),
    Api: {
      isSimulationError: vi.fn().mockReturnValue(false),
    },
    assembleTransaction: vi.fn().mockReturnValue({
      build: vi.fn().mockReturnValue({
        toEnvelope: vi.fn().mockReturnValue({
          toXDR: vi.fn().mockReturnValue('unsigned-xdr'),
        }),
      }),
    }),
  },
  nativeToScVal: vi.fn((value) => ({ value })),
  Networks: { TESTNET: 'Test SDF Network ; September 2015' },
  Keypair: {},
}));

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

describe('POST /api/v1/refunds/request', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetAccount.mockResolvedValue({ accountId: address });
    mockSimulateTransaction.mockResolvedValue({});
    mockSendTransaction.mockResolvedValue({ status: 'PENDING', hash: 'refund-tx-hash' });
  });

  it('returns 401 without an Authorization header', async () => {
    const app = createApp();
    const res = await request(app)
      .post('/api/v1/refunds/request')
      .send({ tipTxHash: 'tip-hash', reason: 'wrong creator' });

    expect(res.status).toBe(401);
  });

  it('returns 400 for an empty body', async () => {
    mockAuth();
    const app = createApp();
    const res = await request(app)
      .post('/api/v1/refunds/request')
      .set('Authorization', 'Bearer valid-token')
      .send({});

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('returns 404 when the tip does not exist', async () => {
    mockAuth();
    mockUserFindUnique.mockResolvedValue({ id: 'user-1', stellarAddress: address });
    mockTipFindUnique.mockResolvedValue(null);

    const app = createApp();
    const res = await request(app)
      .post('/api/v1/refunds/request')
      .set('Authorization', 'Bearer valid-token')
      .send({ tipTxHash: 'tip-hash', reason: 'wrong creator' });

    expect(res.status).toBe(404);
  });

  it("returns 403 when the tip was not sent by the authenticated user", async () => {
    mockAuth();
    mockUserFindUnique.mockResolvedValue({ id: 'user-1', stellarAddress: address });
    mockTipFindUnique.mockResolvedValue({
      id: 'tip-1',
      fromAddress: 'GDIFFERENTADDRESS',
      status: 'CONFIRMED',
      amountStroops: BigInt(1_000_000),
    });

    const app = createApp();
    const res = await request(app)
      .post('/api/v1/refunds/request')
      .set('Authorization', 'Bearer valid-token')
      .send({ tipTxHash: 'tip-hash', reason: 'wrong creator' });

    expect(res.status).toBe(403);
  });

  it('returns 400 when the tip is not confirmed', async () => {
    mockAuth();
    mockUserFindUnique.mockResolvedValue({ id: 'user-1', stellarAddress: address });
    mockTipFindUnique.mockResolvedValue({
      id: 'tip-1',
      fromAddress: address,
      status: 'PENDING',
      amountStroops: BigInt(1_000_000),
    });

    const app = createApp();
    const res = await request(app)
      .post('/api/v1/refunds/request')
      .set('Authorization', 'Bearer valid-token')
      .send({ tipTxHash: 'tip-hash', reason: 'wrong creator' });

    expect(res.status).toBe(400);
  });

  it('returns 409 when a refund has already been requested for the tip', async () => {
    mockAuth();
    mockUserFindUnique.mockResolvedValue({ id: 'user-1', stellarAddress: address });
    mockTipFindUnique.mockResolvedValue({
      id: 'tip-1',
      fromAddress: address,
      status: 'CONFIRMED',
      amountStroops: BigInt(1_000_000),
    });
    mockRefundFindUnique.mockResolvedValue({ id: 'refund-1', tipId: 'tip-1' });

    const app = createApp();
    const res = await request(app)
      .post('/api/v1/refunds/request')
      .set('Authorization', 'Bearer valid-token')
      .send({ tipTxHash: 'tip-hash', reason: 'wrong creator' });

    expect(res.status).toBe(409);
  });

  it('creates a pending refund for a confirmed tip sent by the authenticated user', async () => {
    mockAuth();
    mockUserFindUnique.mockResolvedValue({ id: 'user-1', stellarAddress: address });
    mockTipFindUnique.mockResolvedValue({
      id: 'tip-1',
      fromAddress: address,
      status: 'CONFIRMED',
      amountStroops: BigInt(1_000_000),
    });
    mockRefundFindUnique.mockResolvedValue(null);
    mockRefundCreate.mockResolvedValue({
      id: 'refund-1',
      tipId: 'tip-1',
      amount: BigInt(1_000_000),
      reason: 'wrong creator',
      status: 'pending',
      txHash: null,
      createdAt: new Date('2024-01-01T00:00:00.000Z'),
      updatedAt: new Date('2024-01-01T00:00:00.000Z'),
    });

    const app = createApp();
    const res = await request(app)
      .post('/api/v1/refunds/request')
      .set('Authorization', 'Bearer valid-token')
      .send({ tipTxHash: 'tip-hash', reason: 'wrong creator' });

    expect(res.status).toBe(201);
    expect(mockRefundCreate).toHaveBeenCalledWith({
      data: {
        tipId: 'tip-1',
        amount: BigInt(1_000_000),
        reason: 'wrong creator',
        status: 'pending',
      },
    });
    expect(res.body.data).toMatchObject({
      id: 'refund-1',
      tipId: 'tip-1',
      amountStroops: '1000000',
      reason: 'wrong creator',
      status: 'pending',
      txHash: null,
    });
  });
});

describe('GET /api/v1/refunds/me', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetAccount.mockResolvedValue({ accountId: address });
    mockSimulateTransaction.mockResolvedValue({});
    mockSendTransaction.mockResolvedValue({ status: 'PENDING', hash: 'refund-tx-hash' });
  });

  it('returns 401 without an Authorization header', async () => {
    const app = createApp();
    const res = await request(app).get('/api/v1/refunds/me');
    expect(res.status).toBe(401);
  });

  it("returns the authenticated user's refund history", async () => {
    mockAuth();
    mockUserFindUnique.mockResolvedValue({ id: 'user-1', stellarAddress: address });
    mockRefundFindMany.mockResolvedValue([
      {
        id: 'refund-1',
        tipId: 'tip-1',
        amount: BigInt(1_000_000),
        reason: 'wrong creator',
        status: 'pending',
        txHash: null,
        createdAt: new Date('2024-01-01T00:00:00.000Z'),
        updatedAt: new Date('2024-01-01T00:00:00.000Z'),
      },
    ]);

    const app = createApp();
    const res = await request(app)
      .get('/api/v1/refunds/me')
      .set('Authorization', 'Bearer valid-token');

    expect(res.status).toBe(200);
    expect(res.body.data[0]).toMatchObject({
      id: 'refund-1',
      tipId: 'tip-1',
      amountStroops: '1000000',
      status: 'pending',
    });
    expect(mockRefundFindMany).toHaveBeenCalledWith({
      where: { tip: { fromAddress: address } },
      orderBy: { createdAt: 'desc' },
      skip: 0,
      take: 20,
    });
  });

  it('returns an empty array when the user has no refunds', async () => {
    mockAuth();
    mockUserFindUnique.mockResolvedValue({ id: 'user-1', stellarAddress: address });
    mockRefundFindMany.mockResolvedValue([]);

    const app = createApp();
    const res = await request(app)
      .get('/api/v1/refunds/me')
      .set('Authorization', 'Bearer valid-token');

    expect(res.status).toBe(200);
    expect(res.body.data).toEqual([]);
  });

  it('respects pagination limits', async () => {
    mockAuth();
    mockUserFindUnique.mockResolvedValue({ id: 'user-1', stellarAddress: address });
    mockRefundFindMany.mockResolvedValue([]);

    const app = createApp();
    const res = await request(app)
      .get('/api/v1/refunds/me?limit=50&offset=10')
      .set('Authorization', 'Bearer valid-token');

    expect(res.status).toBe(200);
    expect(mockRefundFindMany).toHaveBeenCalledWith({
      where: { tip: { fromAddress: address } },
      orderBy: { createdAt: 'desc' },
      skip: 10,
      take: 50,
    });
  });

  it('orders refunds by creation date descending', async () => {
    mockAuth();
    mockUserFindUnique.mockResolvedValue({ id: 'user-1', stellarAddress: address });
    mockRefundFindMany.mockResolvedValue([
      {
        id: 'refund-2',
        tipId: 'tip-2',
        amount: BigInt(2_000_000),
        reason: 'duplicate',
        status: 'completed',
        txHash: 'tx-hash-2',
        createdAt: new Date('2024-01-02T00:00:00.000Z'),
        updatedAt: new Date('2024-01-02T00:00:00.000Z'),
      },
      {
        id: 'refund-1',
        tipId: 'tip-1',
        amount: BigInt(1_000_000),
        reason: 'wrong creator',
        status: 'pending',
        txHash: null,
        createdAt: new Date('2024-01-01T00:00:00.000Z'),
        updatedAt: new Date('2024-01-01T00:00:00.000Z'),
      },
    ]);

    const app = createApp();
    const res = await request(app)
      .get('/api/v1/refunds/me')
      .set('Authorization', 'Bearer valid-token');

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(2);
    expect(res.body.data[0].id).toBe('refund-2');
    expect(res.body.data[1].id).toBe('refund-1');
  });
});

describe('GET /api/v1/refunds/received', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns received refund requests with pagination', async () => {
    mockAuth('creator-1');
    mockUserFindUnique.mockResolvedValue({ id: 'creator-1', stellarAddress: address });
    mockRefundFindMany.mockResolvedValue([
      {
        id: 'refund-1',
        tipId: '123',
        amount: BigInt(1_000_000),
        reason: 'wrong creator',
        status: 'pending',
        txHash: null,
        createdAt: new Date('2024-01-01T00:00:00.000Z'),
        updatedAt: new Date('2024-01-01T00:00:00.000Z'),
      },
    ]);

    const app = createApp();
    const res = await request(app)
      .get('/api/v1/refunds/received?limit=10&offset=5')
      .set('Authorization', 'Bearer valid-token');

    expect(res.status).toBe(200);
    expect(res.body.data[0].id).toBe('refund-1');
    expect(mockRefundFindMany).toHaveBeenCalledWith({
      where: { tip: { toAddress: address } },
      orderBy: { createdAt: 'desc' },
      skip: 5,
      take: 10,
    });
  });
});

describe('creator refund resolution endpoints', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetAccount.mockResolvedValue({ accountId: address });
    mockSimulateTransaction.mockResolvedValue({});
    mockSendTransaction.mockResolvedValue({ status: 'PENDING', hash: 'refund-tx-hash' });
  });

  function mockPendingRefund(toAddress = address, status = 'pending') {
    mockUserFindUnique.mockResolvedValue({ id: 'creator-1', stellarAddress: address });
    mockRefundFindUnique.mockResolvedValue({
      id: 'refund-1',
      tipId: '123',
      amount: BigInt(1_000_000),
      reason: 'wrong creator',
      status,
      txHash: null,
      createdAt: new Date('2024-01-01T00:00:00.000Z'),
      updatedAt: new Date('2024-01-01T00:00:00.000Z'),
      tip: {
        id: '123',
        toAddress,
      },
    });
  }

  it('returns 403 when a non-recipient tries to approve', async () => {
    mockAuth('creator-1');
    mockPendingRefund('GOTHERRECIPIENT');

    const app = createApp();
    const res = await request(app)
      .post('/api/v1/refunds/refund-1/approve')
      .set('Authorization', 'Bearer valid-token')
      .send({});

    expect(res.status).toBe(403);
  });

  it('returns 409 when approving a non-pending refund', async () => {
    mockAuth('creator-1');
    mockPendingRefund(address, 'approved');

    const app = createApp();
    const res = await request(app)
      .post('/api/v1/refunds/refund-1/approve')
      .set('Authorization', 'Bearer valid-token')
      .send({});

    expect(res.status).toBe(409);
  });

  it('prepares an approval transaction for the tip recipient', async () => {
    mockAuth('creator-1');
    mockPendingRefund();

    const app = createApp();
    const res = await request(app)
      .post('/api/v1/refunds/refund-1/approve')
      .set('Authorization', 'Bearer valid-token')
      .send({});

    expect(res.status).toBe(200);
    expect(res.body.data.unsignedTxXdr).toBe('unsigned-xdr');
    expect(mockSimulateTransaction).toHaveBeenCalledOnce();
  });

  it('requires a reason when preparing rejection', async () => {
    mockAuth('creator-1');
    mockPendingRefund();

    const app = createApp();
    const res = await request(app)
      .post('/api/v1/refunds/refund-1/reject')
      .set('Authorization', 'Bearer valid-token')
      .send({});

    expect(res.status).toBe(400);
  });

  it('submits approval and marks the refund approved', async () => {
    mockAuth('creator-1');
    mockPendingRefund();
    mockRefundUpdate.mockResolvedValue({
      id: 'refund-1',
      status: 'approved',
      txHash: 'refund-tx-hash',
    });

    const app = createApp();
    const res = await request(app)
      .post('/api/v1/refunds/refund-1/approve/submit')
      .set('Authorization', 'Bearer valid-token')
      .send({ signedTxXdr: 'signed-xdr' });

    expect(res.status).toBe(200);
    expect(mockSendTransaction).toHaveBeenCalledOnce();
    expect(mockRefundUpdate).toHaveBeenCalledWith({
      where: { id: 'refund-1' },
      data: { status: 'approved', txHash: 'refund-tx-hash' },
    });
  });

  it('submits rejection and records the rejection reason', async () => {
    mockAuth('creator-1');
    mockPendingRefund();
    mockRefundUpdate.mockResolvedValue({
      id: 'refund-1',
      status: 'rejected',
      txHash: 'refund-tx-hash',
    });

    const app = createApp();
    const res = await request(app)
      .post('/api/v1/refunds/refund-1/reject/submit')
      .set('Authorization', 'Bearer valid-token')
      .send({ signedTxXdr: 'signed-xdr', reason: 'not refundable' });

    expect(res.status).toBe(200);
    expect(mockRefundUpdate).toHaveBeenCalledWith({
      where: { id: 'refund-1' },
      data: { status: 'rejected', txHash: 'refund-tx-hash', reason: 'not refundable' },
    });
  });
});
