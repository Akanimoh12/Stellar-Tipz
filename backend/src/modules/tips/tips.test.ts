import request from 'supertest';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { createApp } from '../../app.js';

const { mockGetAccount, mockSimulateTransaction, mockContractCall } = vi.hoisted(() => ({
  mockGetAccount: vi.fn(),
  mockSimulateTransaction: vi.fn(),
  mockContractCall: vi.fn(),
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
