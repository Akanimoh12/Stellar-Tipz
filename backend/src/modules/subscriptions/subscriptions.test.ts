import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp } from '../../app.js';

const {
  mockFindMany,
  mockUserFindUnique,
  mockSubFindUnique,
  mockUpsert,
  mockUpdate,
  mockGetAccount,
  mockSimulateTransaction,
  mockSendTransaction,
  mockFromXDR,
} = vi.hoisted(() => ({
  mockFindMany: vi.fn(),
  mockUserFindUnique: vi.fn(),
  mockSubFindUnique: vi.fn(),
  mockUpsert: vi.fn(),
  mockUpdate: vi.fn(),
  mockGetAccount: vi.fn(),
  mockSimulateTransaction: vi.fn(),
  mockSendTransaction: vi.fn(),
  mockFromXDR: vi.fn(),
}));

vi.mock('../../db/prisma.js', () => ({
  prisma: {
    subscription: {
      findMany: mockFindMany,
      findUnique: mockSubFindUnique,
      upsert: mockUpsert,
      update: mockUpdate,
    },
    user: { findUnique: mockUserFindUnique },
    $disconnect: vi.fn(),
  },
}));

vi.mock('@stellar/stellar-sdk', () => {
  const mockPreparedTx = {
    build: vi.fn(() => ({
      toEnvelope: vi.fn(() => ({
        toXDR: vi.fn(() => 'AAAAAgAAAAA...mock-unsigned-xdr...'),
      })),
      sign: vi.fn(),
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
    Keypair: { fromSecret: vi.fn(() => ({ publicKey: () => 'GKEEPER...' })) },
  };
});

vi.mock('jsonwebtoken', () => ({
  default: { verify: vi.fn() },
}));

const jwt = await import('jsonwebtoken');
const tipperAddress = 'GF5YV3FQRHRMA7IQWCZKGRRJ5P7CEPIVBQLM4X2FEHS2IU57KF3U4CLN';
const creatorAddress = 'GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5';

function mockAuth(userId = 'tipper-1'): void {
  (jwt.default.verify as ReturnType<typeof vi.fn>).mockReturnValue({
    sub: userId,
    stellarAddress: tipperAddress,
  });
}

describe('GET /api/v1/subscriptions/me', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 401 without an Authorization header', async () => {
    const app = createApp();
    const res = await request(app).get('/api/v1/subscriptions/me');
    expect(res.status).toBe(401);
  });

  it("returns the authenticated user's subscriptions as tipper by default", async () => {
    mockAuth();
    mockFindMany.mockResolvedValue([
      {
        id: 'sub_tipper-1_creator-1',
        tipperId: 'tipper-1',
        creatorId: 'creator-1',
        amountStroops: BigInt(10_000_000),
        interval: 'MONTHLY',
        nextChargeAt: new Date('2026-08-01T00:00:00.000Z'),
        status: 'ACTIVE',
        createdAt: new Date('2026-07-01T00:00:00.000Z'),
        tipper: { stellarAddress: tipperAddress },
        creator: { stellarAddress: creatorAddress },
      },
    ]);

    const app = createApp();
    const res = await request(app)
      .get('/api/v1/subscriptions/me')
      .set('Authorization', 'Bearer valid-token');

    expect(res.status).toBe(200);
    expect(res.body.data[0]).toMatchObject({
      id: 'sub_tipper-1_creator-1',
      tipperStellarAddress: tipperAddress,
      creatorStellarAddress: creatorAddress,
      amountStroops: '10000000',
      interval: 'MONTHLY',
      status: 'ACTIVE',
    });
    expect(mockFindMany).toHaveBeenCalledWith({
      where: { tipperId: 'tipper-1', deletedAt: null },
      include: { tipper: true, creator: true },
      orderBy: { createdAt: 'desc' },
      skip: 0,
      take: 20,
    });
  });

  it('returns 401 with an invalid token', async () => {
    (jwt.default.verify as ReturnType<typeof vi.fn>).mockImplementation(() => {
      throw new Error('Invalid token');
    });
    const app = createApp();
    const res = await request(app)
      .get('/api/v1/subscriptions/me')
      .set('Authorization', 'Bearer invalid-token');
    expect(res.status).toBe(401);
  });

  it('returns empty list when user has no subscriptions', async () => {
    mockAuth();
    mockFindMany.mockResolvedValue([]);

    const app = createApp();
    const res = await request(app)
      .get('/api/v1/subscriptions/me')
      .set('Authorization', 'Bearer valid-token');

    expect(res.status).toBe(200);
    expect(res.body.data).toEqual([]);
  });

  it('filters by creator role and status when provided', async () => {
    mockAuth();
    mockFindMany.mockResolvedValue([]);

    const app = createApp();
    const res = await request(app)
      .get('/api/v1/subscriptions/me?role=creator&status=ACTIVE&limit=5&offset=10')
      .set('Authorization', 'Bearer valid-token');

    expect(res.status).toBe(200);
    expect(mockFindMany).toHaveBeenCalledWith({
      where: { creatorId: 'tipper-1', deletedAt: null, status: 'ACTIVE' },
      include: { tipper: true, creator: true },
      orderBy: { createdAt: 'desc' },
      skip: 10,
      take: 5,
    });
  });
});

describe('POST /api/v1/subscriptions/prepare', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 401 without an Authorization header', async () => {
    const app = createApp();
    const res = await request(app)
      .post('/api/v1/subscriptions/prepare')
      .send({ creatorStellarAddress: creatorAddress, amountStroops: '1000000', interval: 'MONTHLY' });
    expect(res.status).toBe(401);
  });

  it('returns 400 for an invalid body', async () => {
    mockAuth();
    const app = createApp();
    const res = await request(app)
      .post('/api/v1/subscriptions/prepare')
      .set('Authorization', 'Bearer valid-token')
      .send({ creatorStellarAddress: 'not-an-address', amountStroops: '1000000', interval: 'MONTHLY' });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('returns 400 when subscribing to yourself', async () => {
    mockAuth();
    mockUserFindUnique
      .mockResolvedValueOnce({ id: 'tipper-1', stellarAddress: tipperAddress })
      .mockResolvedValueOnce({ id: 'tipper-1', stellarAddress: tipperAddress });

    const app = createApp();
    const res = await request(app)
      .post('/api/v1/subscriptions/prepare')
      .set('Authorization', 'Bearer valid-token')
      .send({ creatorStellarAddress: tipperAddress, amountStroops: '1000000', interval: 'MONTHLY' });

    expect(res.status).toBe(400);
  });

  it('returns 400 when the creator is not found', async () => {
    mockAuth();
    mockUserFindUnique
      .mockResolvedValueOnce({ id: 'tipper-1', stellarAddress: tipperAddress })
      .mockResolvedValueOnce(null);

    const app = createApp();
    const res = await request(app)
      .post('/api/v1/subscriptions/prepare')
      .set('Authorization', 'Bearer valid-token')
      .send({ creatorStellarAddress: creatorAddress, amountStroops: '1000000', interval: 'MONTHLY' });

    expect(res.status).toBe(400);
  });

  it('returns a prepared transaction on success', async () => {
    mockAuth();
    mockUserFindUnique
      .mockResolvedValueOnce({ id: 'tipper-1', stellarAddress: tipperAddress })
      .mockResolvedValueOnce({ id: 'creator-1', stellarAddress: creatorAddress });
    mockGetAccount.mockResolvedValue({});
    mockSimulateTransaction.mockResolvedValue({});

    const app = createApp();
    const res = await request(app)
      .post('/api/v1/subscriptions/prepare')
      .set('Authorization', 'Bearer valid-token')
      .send({ creatorStellarAddress: creatorAddress, amountStroops: '1000000', interval: 'MONTHLY' });

    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({
      unsignedTxXdr: 'AAAAAgAAAAA...mock-unsigned-xdr...',
    });
  });
});

describe('POST /api/v1/subscriptions/submit', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 401 without an Authorization header', async () => {
    const app = createApp();
    const res = await request(app)
      .post('/api/v1/subscriptions/submit')
      .send({
        creatorStellarAddress: creatorAddress,
        amountStroops: '1000000',
        interval: 'MONTHLY',
        signedTxXdr: 'signed-xdr',
      });
    expect(res.status).toBe(401);
  });

  it('returns 400 for an invalid body', async () => {
    mockAuth();
    const app = createApp();
    const res = await request(app)
      .post('/api/v1/subscriptions/submit')
      .set('Authorization', 'Bearer valid-token')
      .send({ creatorStellarAddress: 'not-valid', amountStroops: '1000000', interval: 'MONTHLY', signedTxXdr: 'signed-xdr' });
    expect(res.status).toBe(400);
  });

  it('creates the subscription with a deterministic id on success', async () => {
    mockAuth();
    mockUserFindUnique
      .mockResolvedValueOnce({ id: 'tipper-1', stellarAddress: tipperAddress })
      .mockResolvedValueOnce({ id: 'creator-1', stellarAddress: creatorAddress });
    mockFromXDR.mockReturnValue({});
    mockSendTransaction.mockResolvedValue({ status: 'PENDING', hash: 'tx-hash-1' });
    mockUpsert.mockResolvedValue({
      id: 'sub_tipper-1_creator-1',
      status: 'ACTIVE',
      nextChargeAt: new Date('2026-08-01T00:00:00.000Z'),
    });

    const app = createApp();
    const res = await request(app)
      .post('/api/v1/subscriptions/submit')
      .set('Authorization', 'Bearer valid-token')
      .send({
        creatorStellarAddress: creatorAddress,
        amountStroops: '1000000',
        interval: 'MONTHLY',
        signedTxXdr: 'signed-xdr',
      });

    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ id: 'sub_tipper-1_creator-1', status: 'ACTIVE' });
    expect(mockUpsert).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'sub_tipper-1_creator-1' } }),
    );
  });

  it('returns 400 when the network rejects the transaction', async () => {
    mockAuth();
    mockUserFindUnique
      .mockResolvedValueOnce({ id: 'tipper-1', stellarAddress: tipperAddress })
      .mockResolvedValueOnce({ id: 'creator-1', stellarAddress: creatorAddress });
    mockFromXDR.mockReturnValue({});
    mockSendTransaction.mockResolvedValue({ status: 'ERROR', hash: 'tx-hash-1' });

    const app = createApp();
    const res = await request(app)
      .post('/api/v1/subscriptions/submit')
      .set('Authorization', 'Bearer valid-token')
      .send({
        creatorStellarAddress: creatorAddress,
        amountStroops: '1000000',
        interval: 'MONTHLY',
        signedTxXdr: 'signed-xdr',
      });

    expect(res.status).toBe(400);
    expect(mockUpsert).not.toHaveBeenCalled();
  });
});

describe('POST /api/v1/subscriptions/prepare-cancel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 404 when the subscription does not exist', async () => {
    mockAuth();
    mockUserFindUnique
      .mockResolvedValueOnce({ id: 'tipper-1', stellarAddress: tipperAddress })
      .mockResolvedValueOnce({ id: 'creator-1', stellarAddress: creatorAddress });
    mockSubFindUnique.mockResolvedValue(null);

    const app = createApp();
    const res = await request(app)
      .post('/api/v1/subscriptions/prepare-cancel')
      .set('Authorization', 'Bearer valid-token')
      .send({ creatorStellarAddress: creatorAddress });

    expect(res.status).toBe(404);
  });

  it('returns 401 without an Authorization header', async () => {
    const app = createApp();
    const res = await request(app)
      .post('/api/v1/subscriptions/prepare-cancel')
      .send({ creatorStellarAddress: creatorAddress });
    expect(res.status).toBe(401);
  });

  it('returns 400 for an invalid stellar address', async () => {
    mockAuth();
    const app = createApp();
    const res = await request(app)
      .post('/api/v1/subscriptions/prepare-cancel')
      .set('Authorization', 'Bearer valid-token')
      .send({ creatorStellarAddress: 'not-valid' });
    expect(res.status).toBe(400);
  });

  it('returns 400 when the subscription is already cancelled', async () => {
    mockAuth();
    mockUserFindUnique
      .mockResolvedValueOnce({ id: 'tipper-1', stellarAddress: tipperAddress })
      .mockResolvedValueOnce({ id: 'creator-1', stellarAddress: creatorAddress });
    mockSubFindUnique.mockResolvedValue({
      id: 'sub_tipper-1_creator-1',
      tipperId: 'tipper-1',
      status: 'CANCELLED',
      deletedAt: null,
    });

    const app = createApp();
    const res = await request(app)
      .post('/api/v1/subscriptions/prepare-cancel')
      .set('Authorization', 'Bearer valid-token')
      .send({ creatorStellarAddress: creatorAddress });

    expect(res.status).toBe(400);
  });

  it('returns a prepared cancellation transaction on success', async () => {
    mockAuth();
    mockUserFindUnique
      .mockResolvedValueOnce({ id: 'tipper-1', stellarAddress: tipperAddress })
      .mockResolvedValueOnce({ id: 'creator-1', stellarAddress: creatorAddress });
    mockSubFindUnique.mockResolvedValue({
      id: 'sub_tipper-1_creator-1',
      tipperId: 'tipper-1',
      status: 'ACTIVE',
      deletedAt: null,
    });
    mockGetAccount.mockResolvedValue({});
    mockSimulateTransaction.mockResolvedValue({});

    const app = createApp();
    const res = await request(app)
      .post('/api/v1/subscriptions/prepare-cancel')
      .set('Authorization', 'Bearer valid-token')
      .send({ creatorStellarAddress: creatorAddress });

    expect(res.status).toBe(200);
    expect(res.body.data.unsignedTxXdr).toBe('AAAAAgAAAAA...mock-unsigned-xdr...');
  });
});

describe('POST /api/v1/subscriptions/submit-cancel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('marks the subscription CANCELLED on success', async () => {
    mockAuth();
    mockUserFindUnique.mockResolvedValueOnce({ id: 'creator-1', stellarAddress: creatorAddress });
    mockSubFindUnique.mockResolvedValue({
      id: 'sub_tipper-1_creator-1',
      tipperId: 'tipper-1',
      status: 'ACTIVE',
      deletedAt: null,
    });
    mockFromXDR.mockReturnValue({});
    mockSendTransaction.mockResolvedValue({ status: 'PENDING', hash: 'tx-hash-2' });
    mockUpdate.mockResolvedValue({ id: 'sub_tipper-1_creator-1', status: 'CANCELLED' });

    const app = createApp();
    const res = await request(app)
      .post('/api/v1/subscriptions/submit-cancel')
      .set('Authorization', 'Bearer valid-token')
      .send({ creatorStellarAddress: creatorAddress, signedTxXdr: 'signed-xdr' });

    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ id: 'sub_tipper-1_creator-1', status: 'CANCELLED' });
    expect(mockUpdate).toHaveBeenCalledWith({
      where: { id: 'sub_tipper-1_creator-1' },
      data: { status: 'CANCELLED' },
    });
  });

  it('returns 401 without an Authorization header', async () => {
    const app = createApp();
    const res = await request(app)
      .post('/api/v1/subscriptions/submit-cancel')
      .send({ creatorStellarAddress: creatorAddress, signedTxXdr: 'signed-xdr' });
    expect(res.status).toBe(401);
  });

  it('returns 400 for an invalid stellar address', async () => {
    mockAuth();
    const app = createApp();
    const res = await request(app)
      .post('/api/v1/subscriptions/submit-cancel')
      .set('Authorization', 'Bearer valid-token')
      .send({ creatorStellarAddress: 'not-valid', signedTxXdr: 'signed-xdr' });
    expect(res.status).toBe(400);
  });

  it('returns 404 when subscription does not exist', async () => {
    mockAuth();
    mockUserFindUnique.mockResolvedValueOnce({ id: 'creator-1', stellarAddress: creatorAddress });
    mockSubFindUnique.mockResolvedValue(null);

    const app = createApp();
    const res = await request(app)
      .post('/api/v1/subscriptions/submit-cancel')
      .set('Authorization', 'Bearer valid-token')
      .send({ creatorStellarAddress: creatorAddress, signedTxXdr: 'signed-xdr' });

    expect(res.status).toBe(404);
  });

  it('returns 400 when the network rejects the transaction', async () => {
    mockAuth();
    mockUserFindUnique.mockResolvedValueOnce({ id: 'creator-1', stellarAddress: creatorAddress });
    mockSubFindUnique.mockResolvedValue({
      id: 'sub_tipper-1_creator-1',
      tipperId: 'tipper-1',
      status: 'ACTIVE',
      deletedAt: null,
    });
    mockFromXDR.mockReturnValue({});
    mockSendTransaction.mockResolvedValue({ status: 'ERROR', hash: 'tx-hash-2' });

    const app = createApp();
    const res = await request(app)
      .post('/api/v1/subscriptions/submit-cancel')
      .set('Authorization', 'Bearer valid-token')
      .send({ creatorStellarAddress: creatorAddress, signedTxXdr: 'signed-xdr' });

    expect(res.status).toBe(400);
    expect(mockUpdate).not.toHaveBeenCalled();
  });
});
