/**
 * Tests for #942 (withdrawal minimum + validation) and
 * #943 (withdrawal status tracking via indexer).
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/config/env.js", () => ({
  env: {
    NODE_ENV: "test",
    PORT: 4000,
    API_BASE_PATH: "/api/v1",
    CORS_ORIGIN: "http://localhost:5173",
    JWT_SECRET: "test-secret",
    JWT_EXPIRES_IN: "15m",
    LOG_LEVEL: "silent",
    WITHDRAWAL_MIN_AMOUNT_STROOPS: 10_000_000,
  },
}));

vi.mock("@/db/prisma.js", () => ({
  prisma: {
    withdrawal: {
      create: vi.fn(),
      findUnique: vi.fn(),
      findMany: vi.fn(),
      update: vi.fn(),
    },
  },
}));

import { prisma } from "@/db/prisma.js";
import { createWithdrawalSchema } from "./withdrawals.schema.js";
import {
  requestWithdrawal,
  getWithdrawalById,
  listWithdrawals,
  updateWithdrawalStatus,
} from "./withdrawals.service.js";

const fakeWithdrawal = {
  id: "wd_01",
  userId: "user_01",
  amount: 10_000_000n,
  fee: 0n,
  status: "PENDING",
  txHash: null,
  requestedAt: new Date("2026-01-01T00:00:00Z"),
  confirmedAt: null,
};

beforeEach(() => {
  vi.clearAllMocks();
});

// ── #942 createWithdrawalSchema (minimum + validation) ────────────────────────

describe("createWithdrawalSchema (issue #942)", () => {
  it("accepts an amount at exactly the minimum", () => {
    const result = createWithdrawalSchema.safeParse({ amount: "10000000" });
    expect(result.success).toBe(true);
  });

  it("rejects an amount below the minimum", () => {
    const result = createWithdrawalSchema.safeParse({ amount: "9999999" });
    expect(result.success).toBe(false);
  });

  it("rejects a non-numeric amount", () => {
    const result = createWithdrawalSchema.safeParse({ amount: "abc" });
    expect(result.success).toBe(false);
  });

  it("rejects zero and negative amounts", () => {
    expect(createWithdrawalSchema.safeParse({ amount: "0" }).success).toBe(false);
    expect(createWithdrawalSchema.safeParse({ amount: "-5" }).success).toBe(false);
  });
});

describe("requestWithdrawal (issue #942)", () => {
  it("creates a withdrawal and serialises BigInt amounts to strings", async () => {
    vi.mocked(prisma.withdrawal.create).mockResolvedValue(fakeWithdrawal as never);

    const result = await requestWithdrawal("user_01", { amount: "10000000" });

    expect(prisma.withdrawal.create).toHaveBeenCalledWith({
      data: { userId: "user_01", amount: 10_000_000n, fee: 0n },
    });
    expect(result.amount).toBe("10000000");
    expect(result.status).toBe("PENDING");
  });
});

// ── #943 withdrawal status tracking via indexer ───────────────────────────────

describe("getWithdrawalById / listWithdrawals (issue #943)", () => {
  it("throws NotFoundError when the withdrawal belongs to another user", async () => {
    vi.mocked(prisma.withdrawal.findUnique).mockResolvedValue(fakeWithdrawal as never);

    await expect(getWithdrawalById("wd_01", "someone_else")).rejects.toThrow(
      "Withdrawal not found",
    );
  });

  it("returns the withdrawal when owned by the requesting user", async () => {
    vi.mocked(prisma.withdrawal.findUnique).mockResolvedValue(fakeWithdrawal as never);

    const result = await getWithdrawalById("wd_01", "user_01");
    expect(result.id).toBe("wd_01");
  });

  it("lists withdrawals ordered by most recent", async () => {
    vi.mocked(prisma.withdrawal.findMany).mockResolvedValue([fakeWithdrawal] as never);

    const result = await listWithdrawals("user_01");

    expect(prisma.withdrawal.findMany).toHaveBeenCalledWith({
      where: { userId: "user_01" },
      orderBy: { requestedAt: "desc" },
    });
    expect(result).toHaveLength(1);
  });
});

describe("updateWithdrawalStatus (issue #943)", () => {
  it("throws NotFoundError for an unknown withdrawal", async () => {
    vi.mocked(prisma.withdrawal.findUnique).mockResolvedValue(null);

    await expect(
      updateWithdrawalStatus("missing", "CONFIRMED", "0xabc"),
    ).rejects.toThrow("Withdrawal not found");
  });

  it("confirms a withdrawal and sets confirmedAt + txHash", async () => {
    vi.mocked(prisma.withdrawal.findUnique).mockResolvedValue(fakeWithdrawal as never);
    vi.mocked(prisma.withdrawal.update).mockResolvedValue({
      ...fakeWithdrawal,
      status: "CONFIRMED",
      txHash: "0xabc",
      confirmedAt: new Date("2026-01-02T00:00:00Z"),
    } as never);

    const result = await updateWithdrawalStatus("wd_01", "CONFIRMED", "0xabc");

    expect(result.status).toBe("CONFIRMED");
    expect(result.txHash).toBe("0xabc");
    expect(result.confirmedAt).not.toBeNull();
  });

  it("marks a withdrawal as failed without setting confirmedAt", async () => {
    vi.mocked(prisma.withdrawal.findUnique).mockResolvedValue(fakeWithdrawal as never);
    vi.mocked(prisma.withdrawal.update).mockResolvedValue({
      ...fakeWithdrawal,
      status: "FAILED",
      txHash: "0xdef",
    } as never);

    const result = await updateWithdrawalStatus("wd_01", "FAILED", "0xdef");

    expect(result.status).toBe("FAILED");
    expect(result.confirmedAt).toBeNull();
  });
});
import request from 'supertest';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { createApp } from '../../app.js';

const {
  mockFindMany,
  mockFindUnique,
  mockAggregate,
  mockGetAccount,
  mockSimulateTransaction,
} = vi.hoisted(() => ({
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
    tip: {
      aggregate: mockAggregate,
    },
    user: {
      findUnique: mockFindUnique,
    },
    $disconnect: vi.fn(),
  },
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
      })),
      assembleTransaction: vi.fn(() => mockPreparedTx),
      Api: {
        isSimulationError: vi.fn(() => false),
      },
    },
    Contract: vi.fn(() => ({
      call: vi.fn(),
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

vi.mock('jsonwebtoken', () => ({
  default: {
    verify: vi.fn(),
  },
}));

const jwt = await import('jsonwebtoken');
const address = 'GF5YV3FQRHRMA7IQWCZKGRRJ5P7CEPIVBQLM4X2FEHS2IU57KF3U4CLN';

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
    (jwt.default.verify as ReturnType<typeof vi.fn>).mockReturnValue({
      sub: 'user-1',
      stellarAddress: 'GABC123',
    });
    mockFindMany.mockResolvedValue([
      {
        id: 'wd-1',
        userId: 'user-1',
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
    expect(res.body.data).toHaveLength(1);
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

  it('returns an empty list when the user has no withdrawals', async () => {
    (jwt.default.verify as ReturnType<typeof vi.fn>).mockReturnValue({
      sub: 'user-2',
      stellarAddress: 'GDEF456',
    });
    mockFindMany.mockResolvedValue([]);

    const app = createApp();
    const res = await request(app)
      .get('/api/v1/withdrawals/me')
      .set('Authorization', 'Bearer valid-token');

    expect(res.status).toBe(200);
    expect(res.body.data).toEqual([]);
  });
});

describe('GET /api/v1/balances/me', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 401 without an Authorization header', async () => {
    const app = createApp();
    const res = await request(app).get('/api/v1/balances/me');
    expect(res.status).toBe(401);
  });

  it('returns the withdrawable balance for the authenticated user', async () => {
    (jwt.default.verify as ReturnType<typeof vi.fn>).mockReturnValue({
      sub: 'user-1',
      stellarAddress: address,
    });
    mockFindUnique.mockResolvedValue({
      id: 'user-1',
      stellarAddress: address,
      username: null,
      displayName: null,
      bio: null,
      imageUrl: null,
      avatarCid: null,
      xHandle: null,
      role: 'user',
      scopes: [],
      createdAt: new Date(),
      updatedAt: new Date(),
      deletedAt: null,
    });
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

  it('returns zero balance when user has no tips or withdrawals', async () => {
    (jwt.default.verify as ReturnType<typeof vi.fn>).mockReturnValue({
      sub: 'user-3',
      stellarAddress: address,
    });
    mockFindUnique.mockResolvedValue({
      id: 'user-3',
      stellarAddress: address,
      username: null,
      displayName: null,
      bio: null,
      imageUrl: null,
      avatarCid: null,
      xHandle: null,
      role: 'user',
      scopes: [],
      createdAt: new Date(),
      updatedAt: new Date(),
      deletedAt: null,
    });
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

  it('returns 401 without an Authorization header', async () => {
    const app = createApp();
    const res = await request(app).post('/api/v1/withdrawals/prepare').send({ amount: '100' });
    expect(res.status).toBe(401);
  });

  it('returns 400 when amount is missing', async () => {
    (jwt.default.verify as ReturnType<typeof vi.fn>).mockReturnValue({
      sub: 'user-1',
      stellarAddress: address,
    });

    const app = createApp();
    const res = await request(app)
      .post('/api/v1/withdrawals/prepare')
      .set('Authorization', 'Bearer valid-token')
      .send({});
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('returns 400 for invalid amount', async () => {
    (jwt.default.verify as ReturnType<typeof vi.fn>).mockReturnValue({
      sub: 'user-1',
      stellarAddress: address,
    });

    const app = createApp();
    const res = await request(app)
      .post('/api/v1/withdrawals/prepare')
      .set('Authorization', 'Bearer valid-token')
      .send({ amount: 'not-a-number' });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('returns prepared transaction on success', async () => {
    (jwt.default.verify as ReturnType<typeof vi.fn>).mockReturnValue({
      sub: 'user-1',
      stellarAddress: address,
    });
    mockFindUnique.mockResolvedValue({
      id: 'user-1',
      stellarAddress: address,
      username: null,
      displayName: null,
      bio: null,
      imageUrl: null,
      avatarCid: null,
      xHandle: null,
      role: 'user',
      scopes: [],
      createdAt: new Date(),
      updatedAt: new Date(),
      deletedAt: null,
    });
    mockAggregate
      .mockResolvedValueOnce({ _sum: { amountStroops: BigInt(5_000_000) } })
      .mockResolvedValueOnce({ _sum: { amount: BigInt(0) } });
    mockGetAccount.mockResolvedValue({
      accountId: () => address,
      sequenceNumber: () => '123',
      incrementSequenceNumber: () => {},
    });
    mockSimulateTransaction.mockResolvedValue({});

    const app = createApp();
    const res = await request(app)
      .post('/api/v1/withdrawals/prepare')
      .set('Authorization', 'Bearer valid-token')
      .send({ amount: '1000000' });

    expect(res.status).toBe(200);
    expect(res.body.data.unsignedTxXdr).toBeDefined();
    expect(res.body.data.destination).toBe(address);
    expect(res.body.data.amount).toBe('1000000');
    expect(res.body.data.contractId).toBeDefined();
  });

  it('returns 400 when balance is insufficient', async () => {
    (jwt.default.verify as ReturnType<typeof vi.fn>).mockReturnValue({
      sub: 'user-1',
      stellarAddress: address,
    });
    mockFindUnique.mockResolvedValue({
      id: 'user-1',
      stellarAddress: address,
      username: null,
      displayName: null,
      bio: null,
      imageUrl: null,
      avatarCid: null,
      xHandle: null,
      role: 'user',
      scopes: [],
      createdAt: new Date(),
      updatedAt: new Date(),
      deletedAt: null,
    });
    mockAggregate
      .mockResolvedValueOnce({ _sum: { amountStroops: BigInt(500) } })
      .mockResolvedValueOnce({ _sum: { amount: BigInt(0) } });

    const app = createApp();
    const res = await request(app)
      .post('/api/v1/withdrawals/prepare')
      .set('Authorization', 'Bearer valid-token')
      .send({ amount: '1000000' });

    expect(res.status).toBe(400);
    expect(res.body.error.message).toContain('Insufficient');
  });
});
