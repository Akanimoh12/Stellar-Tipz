import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  fakeServer,
  mockGetAccount,
  mockSimulateTransaction,
  mockSendTransaction,
  mockGetTransaction,
  mockPreparedSign,
} = vi.hoisted(() => {
  const mockGetAccount = vi.fn();
  const mockSimulateTransaction = vi.fn();
  const mockSendTransaction = vi.fn();
  const mockGetTransaction = vi.fn();
  return {
    fakeServer: {
      getAccount: mockGetAccount,
      simulateTransaction: mockSimulateTransaction,
      sendTransaction: mockSendTransaction,
      getTransaction: mockGetTransaction,
    },
    mockGetAccount,
    mockSimulateTransaction,
    mockSendTransaction,
    mockGetTransaction,
    mockPreparedSign: vi.fn(),
  };
});

vi.mock('../../config/index.js', () => ({
  config: {
    stellar: {
      contractId: 'CONTRACT_ID',
      network: 'TESTNET',
      networkPassphrase: 'Test SDF Network ; September 2015',
    },
    subscriptions: { keeperSecretKey: 'KEEPER_SECRET' },
  },
}));

vi.mock('../../db/prisma.js', () => ({ prisma: {} }));

vi.mock('../../common/stellar/rpcClient.js', () => ({
  rpcCall: vi.fn(async (operation: (server: typeof fakeServer) => unknown) =>
    operation(fakeServer),
  ),
}));

vi.mock('@stellar/stellar-sdk', () => {
  class MockTransactionBuilder {
    addOperation() {
      return this;
    }

    setTimeout() {
      return this;
    }

    build() {
      return { transaction: true };
    }
  }

  return {
    Contract: class {
      call() {
        return { operation: true };
      }
    },
    TransactionBuilder: MockTransactionBuilder,
    nativeToScVal: vi.fn((value: unknown) => value),
    Networks: { TESTNET: 'Test SDF Network ; September 2015' },
    Keypair: {
      fromSecret: vi.fn(() => ({
        publicKey: () => 'KEEPER_PUBLIC_KEY',
      })),
    },
    SorobanRpc: {
      Api: {
        isSimulationError: vi.fn(() => false),
        GetTransactionStatus: {
          SUCCESS: 'SUCCESS',
          NOT_FOUND: 'NOT_FOUND',
          FAILED: 'FAILED',
        },
      },
      assembleTransaction: vi.fn(() => ({
        build: () => ({ sign: mockPreparedSign }),
      })),
    },
  };
});

import { chargeSubscriptionOnChain } from './subscriptions.service.js';

const subscriberAddress = 'GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF';
const creatorAddress = 'GBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBWDM';

describe('chargeSubscriptionOnChain confirmation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetAccount.mockResolvedValue({ account: true });
    mockSimulateTransaction.mockResolvedValue({ simulation: true });
    mockSendTransaction.mockResolvedValue({ status: 'PENDING', hash: 'transaction-hash' });
    mockGetTransaction.mockResolvedValue({ status: 'SUCCESS' });
  });

  it('rejects an immediate submission ERROR without polling', async () => {
    mockSendTransaction.mockResolvedValue({ status: 'ERROR', hash: 'transaction-hash' });

    await expect(chargeSubscriptionOnChain(subscriberAddress, creatorAddress)).rejects.toThrow(
      'Subscription charge transaction rejected by the network',
    );
    expect(mockGetTransaction).not.toHaveBeenCalled();
  });

  it('polls PENDING through NOT_FOUND and resolves only after SUCCESS', async () => {
    mockGetTransaction
      .mockResolvedValueOnce({ status: 'NOT_FOUND' })
      .mockResolvedValueOnce({ status: 'SUCCESS' });
    let nowMs = 0;

    await expect(
      chargeSubscriptionOnChain(subscriberAddress, creatorAddress, {
        now: () => nowMs,
        sleep: async (milliseconds) => {
          nowMs += milliseconds;
        },
      }),
    ).resolves.toBeUndefined();
    expect(mockGetTransaction).toHaveBeenCalledTimes(2);
    expect(mockGetTransaction).toHaveBeenCalledWith('transaction-hash');
  });

  it('rejects when a pending transaction reaches final FAILED', async () => {
    mockGetTransaction.mockResolvedValue({ status: 'FAILED' });

    await expect(chargeSubscriptionOnChain(subscriberAddress, creatorAddress)).rejects.toThrow(
      'Subscription charge transaction failed on-chain',
    );
  });

  it('bounds polling and rejects when a pending transaction never confirms', async () => {
    mockGetTransaction.mockResolvedValue({ status: 'NOT_FOUND' });
    let nowMs = 0;

    await expect(
      chargeSubscriptionOnChain(subscriberAddress, creatorAddress, {
        timeoutMs: 2_500,
        pollIntervalMs: 1_000,
        now: () => nowMs,
        sleep: async (milliseconds) => {
          nowMs += milliseconds;
        },
      }),
    ).rejects.toThrow('Subscription charge confirmation timed out');
    expect(mockGetTransaction).toHaveBeenCalledTimes(3);
  });

  it('does not resolve while confirmation is still NOT_FOUND', async () => {
    mockGetTransaction
      .mockResolvedValueOnce({ status: 'NOT_FOUND' })
      .mockResolvedValueOnce({ status: 'SUCCESS' });
    let releasePoll: (() => void) | undefined;
    const sleep = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          releasePoll = resolve;
        }),
    );
    let settled = false;

    const charge = chargeSubscriptionOnChain(subscriberAddress, creatorAddress, { sleep });
    void charge.finally(() => {
      settled = true;
    });
    await vi.waitFor(() => expect(sleep).toHaveBeenCalledOnce());

    expect(settled).toBe(false);
    expect(mockGetTransaction).toHaveBeenCalledTimes(1);

    releasePoll?.();
    await expect(charge).resolves.toBeUndefined();
    expect(mockGetTransaction).toHaveBeenCalledTimes(2);
  });

  it('confirms a DUPLICATE submission by its transaction hash', async () => {
    mockSendTransaction.mockResolvedValue({ status: 'DUPLICATE', hash: 'transaction-hash' });

    await expect(
      chargeSubscriptionOnChain(subscriberAddress, creatorAddress),
    ).resolves.toBeUndefined();
    expect(mockGetTransaction).toHaveBeenCalledWith('transaction-hash');
  });

  it('rejects TRY_AGAIN_LATER as a temporary submission failure', async () => {
    mockSendTransaction.mockResolvedValue({ status: 'TRY_AGAIN_LATER', hash: 'transaction-hash' });

    await expect(chargeSubscriptionOnChain(subscriberAddress, creatorAddress)).rejects.toThrow(
      'Subscription charge transaction submission is temporarily unavailable',
    );
    expect(mockGetTransaction).not.toHaveBeenCalled();
  });
});
