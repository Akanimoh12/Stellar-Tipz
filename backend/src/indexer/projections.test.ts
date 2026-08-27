import { describe, expect, it, vi, beforeEach } from 'vitest';
import { projectEvent } from './projections.js';
import type { DecodedEvent } from './sorobanClient.js';

const {
  mockUserUpsert,
  mockGoalUpsert,
  mockGoalUpdateMany,
  mockGoalFindUnique,
  mockSubUpsert,
  mockSubUpdateMany,
  mockTipUpsert,
  mockTipFindUnique,
  mockTipUpdate,
  mockRefundUpsert,
  mockEventLogFindFirst,
  mockEventLogCreate,
  mockCreditScoreUpsert,
  mockCreditScoreHistoryUpsert,
  mockPublishProjection,
  mockCreateNotification,
} = vi.hoisted(() => ({
  mockUserUpsert: vi.fn(),
  mockGoalUpsert: vi.fn(),
  mockGoalUpdateMany: vi.fn(),
  mockGoalFindUnique: vi.fn(),
  mockSubUpsert: vi.fn(),
  mockSubUpdateMany: vi.fn(),
  mockTipUpsert: vi.fn(),
  mockTipFindUnique: vi.fn(),
  mockTipUpdate: vi.fn(),
  mockRefundUpsert: vi.fn(),
  mockEventLogFindFirst: vi.fn(),
  mockEventLogCreate: vi.fn(),
  mockCreditScoreUpsert: vi.fn(),
  mockCreditScoreHistoryUpsert: vi.fn(),
  mockPublishProjection: vi.fn(),
  mockCreateNotification: vi.fn(),
}));

vi.mock('../db/prisma.js', () => ({
  prisma: {
    user: { upsert: mockUserUpsert },
    goal: { upsert: mockGoalUpsert, updateMany: mockGoalUpdateMany, findUnique: mockGoalFindUnique },
    subscription: { upsert: mockSubUpsert, updateMany: mockSubUpdateMany },
    tip: { upsert: mockTipUpsert, findUnique: mockTipFindUnique, update: mockTipUpdate },
    refund: { upsert: mockRefundUpsert },
    eventLog: { findFirst: mockEventLogFindFirst, create: mockEventLogCreate },
    creditScore: { upsert: mockCreditScoreUpsert },
    creditScoreHistory: { upsert: mockCreditScoreHistoryUpsert },
  },
}));

vi.mock('./realtime-publisher.js', () => ({
  publishProjection: mockPublishProjection,
}));

vi.mock('../modules/notifications/notifications.service.js', () => ({
  createNotification: mockCreateNotification,
}));

/** Build a decoded event; `value` is the positional payload tuple. */
const event = (topic: string, value: unknown, overrides: Partial<DecodedEvent> = {}): DecodedEvent => ({
  ledger: 100,
  txHash: 'tx-' + topic,
  pagingToken: '100-1',
  topic,
  value,
  ...overrides,
});

const ADDR_A = 'GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';
const ADDR_B = 'GBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB';

const tipEvent: DecodedEvent = {
  ledger: 100,
  txHash: 'aabbcc001122',
  pagingToken: '100-0',
  topic: 'tip_sent',
  value: {
    from: 'GABC1234567890ABCDEFGHIJKLMNOPQRSTUVWXYZ234567890ABCDEFGHIJKL',
    to: 'GDEF1234567890ABCDEFGHIJKLMNOPQRSTUVWXYZ234567890ABCDEFGHIJKL',
    amount: '5000000',
    message: 'Great content!',
  },
};

const nonTipEvent: DecodedEvent = {
  ledger: 101,
  txHash: 'ddeeff334455',
  pagingToken: '101-0',
  topic: 'subscription_charged',
  value: { subscriber: 'GABC', creator: 'GDEF' },
};

beforeEach(() => {
  vi.clearAllMocks();
  mockUserUpsert.mockImplementation(async (args: { where: { stellarAddress: string } }) => ({
    id: 'u_' + args.where.stellarAddress,
  }));
  mockEventLogFindFirst.mockResolvedValue(null);
  mockEventLogCreate.mockResolvedValue({});
  mockGoalUpsert.mockResolvedValue({});
  mockGoalUpdateMany.mockResolvedValue({ count: 1 });
  mockGoalFindUnique.mockResolvedValue(null);
  mockCreateNotification.mockResolvedValue(null);
  mockSubUpsert.mockResolvedValue({});
  mockSubUpdateMany.mockResolvedValue({ count: 1 });
  mockCreditScoreUpsert.mockResolvedValue({});
  mockCreditScoreHistoryUpsert.mockResolvedValue({});
  mockPublishProjection.mockResolvedValue(undefined);
});

describe('projectEvent — raw event log', () => {
  it('persists every event before projecting', async () => {
    await projectEvent(event('profile_register', [ADDR_A, 'alice']));
    expect(mockEventLogCreate).toHaveBeenCalledOnce();
  });

  it('skips re-inserting an already-stored event (idempotent)', async () => {
    mockEventLogFindFirst.mockResolvedValue({ id: 'existing' });
    await projectEvent(event('profile_register', [ADDR_A, 'alice']));
    expect(mockEventLogCreate).not.toHaveBeenCalled();
  });

  it('ignores topics with no projection handler', async () => {
    await projectEvent(event('fee_updated', [10, 20]));
    expect(mockUserUpsert).not.toHaveBeenCalled();
    expect(mockGoalUpsert).not.toHaveBeenCalled();
    expect(mockSubUpsert).not.toHaveBeenCalled();
  });
});

describe('projectEvent — realtime publish', () => {
  it('publishes to the realtime layer after a new event is projected', async () => {
    const e = event('profile_register', [ADDR_A, 'alice']);
    await projectEvent(e);
    expect(mockPublishProjection).toHaveBeenCalledTimes(1);
    expect(mockPublishProjection).toHaveBeenCalledWith(e);
  });

  it('does not publish when replaying an already-stored event (idempotent)', async () => {
    mockEventLogFindFirst.mockResolvedValue({ id: 'existing' });
    await projectEvent(event('profile_register', [ADDR_A, 'alice']));
    expect(mockPublishProjection).not.toHaveBeenCalled();
  });

  it('publishes exactly once per unique event across repeated runs over the same ledgers', async () => {
    const e = event('tip_sent', tipEvent.value, { txHash: tipEvent.txHash, ledger: tipEvent.ledger });

    // First run: event log is empty, so the event is new.
    mockEventLogFindFirst.mockResolvedValueOnce(null);
    await projectEvent(e);

    // Re-run over the same ledger range: event log now has the row.
    mockEventLogFindFirst.mockResolvedValueOnce({ id: 'existing' });
    await projectEvent(e);

    expect(mockPublishProjection).toHaveBeenCalledTimes(1);
  });

  it('still projects and publishes the tip event even on the early-return tip branch', async () => {
    await projectEvent(tipEvent);
    expect(mockTipUpsert).toHaveBeenCalledOnce();
    expect(mockPublishProjection).toHaveBeenCalledWith(tipEvent);
  });
});

describe('projectEvent — profile (#895, #896)', () => {
  it('upserts the user from a registration event', async () => {
    await projectEvent(event('profile_register', [ADDR_A, 'alice']));
    expect(mockUserUpsert).toHaveBeenCalledWith({
      where: { stellarAddress: ADDR_A },
      create: { stellarAddress: ADDR_A, username: 'alice' },
      update: { username: 'alice' },
    });
  });

  it('registration without a username leaves username untouched on replay', async () => {
    await projectEvent(event('profile_register', [ADDR_A, '']));
    expect(mockUserUpsert).toHaveBeenCalledWith(
      expect.objectContaining({ create: { stellarAddress: ADDR_A, username: null }, update: {} }),
    );
  });

  it('registration is idempotent — same address keys the same upsert', async () => {
    await projectEvent(event('profile_register', [ADDR_A, 'alice']));
    await projectEvent(event('profile_register', [ADDR_A, 'alice']));
    const wheres = mockUserUpsert.mock.calls.map((c) => c[0].where);
    expect(wheres).toEqual([{ stellarAddress: ADDR_A }, { stellarAddress: ADDR_A }]);
  });

  it('ensures the user exists on a profile update (payload is owner-only)', async () => {
    await projectEvent(event('profile_updated', [ADDR_A]));
    expect(mockUserUpsert).toHaveBeenCalledWith(
      expect.objectContaining({ where: { stellarAddress: ADDR_A }, update: {} }),
    );
  });

  it('skips a registration with an unparseable owner', async () => {
    await projectEvent(event('profile_register', [123, 'alice']));
    expect(mockUserUpsert).not.toHaveBeenCalled();
  });
});

describe('projectEvent — goals (#899)', () => {
  it('creates a goal keyed deterministically per creator', async () => {
    await projectEvent(event('goal_set', [ADDR_A, '1000', 'Buy a mic', '1735000000']));
    expect(mockGoalUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'goal_u_' + ADDR_A },
        create: expect.objectContaining({
          id: 'goal_u_' + ADDR_A,
          userId: 'u_' + ADDR_A,
          title: 'Buy a mic',
          targetStroops: 1000n,
          raisedStroops: 0n,
          status: 'ACTIVE',
        }),
      }),
    );
    const call = mockGoalUpsert.mock.calls[0][0];
    expect(call.create.deadline).toEqual(new Date(1735000000 * 1000));
  });

  it('treats a zero deadline as no deadline', async () => {
    await projectEvent(event('goal_set', [ADDR_A, '1000', 'No deadline', '0']));
    expect(mockGoalUpsert.mock.calls[0][0].create.deadline).toBeNull();
  });

  it('marks a goal completed with the absolute raised amount when reached', async () => {
    await projectEvent(event('goal_reached', [ADDR_A, '1000', '1000']));
    expect(mockGoalUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'goal_u_' + ADDR_A },
        update: { targetStroops: 1000n, raisedStroops: 1000n, status: 'COMPLETED' },
      }),
    );
  });

  it('reached is idempotent — replay produces the same absolute update', async () => {
    await projectEvent(event('goal_reached', [ADDR_A, '1000', '1000']));
    await projectEvent(event('goal_reached', [ADDR_A, '1000', '1000']));
    expect(mockGoalUpsert.mock.calls[0][0].update).toEqual(mockGoalUpsert.mock.calls[1][0].update);
  });

  it('notifies the creator when the goal transitions into COMPLETED (#964)', async () => {
    mockGoalFindUnique.mockResolvedValue(null);
    await projectEvent(event('goal_reached', [ADDR_A, '1000', '1000']));
    expect(mockCreateNotification).toHaveBeenCalledWith(
      'u_' + ADDR_A,
      'goal_reached',
      expect.objectContaining({ targetStroops: '1000', raisedStroops: '1000' }),
    );
  });

  it('does not re-notify when replaying an already-COMPLETED goal', async () => {
    mockGoalFindUnique.mockResolvedValueOnce(null).mockResolvedValueOnce({ status: 'COMPLETED' });
    await projectEvent(event('goal_reached', [ADDR_A, '1000', '1000']));
    await projectEvent(event('goal_reached', [ADDR_A, '1000', '1000']));
    expect(mockCreateNotification).toHaveBeenCalledTimes(1);
  });

  it('cancels a goal via updateMany (no-op when absent)', async () => {
    await projectEvent(event('goal_cancel', ADDR_A));
    expect(mockGoalUpdateMany).toHaveBeenCalledWith({
      where: { id: 'goal_u_' + ADDR_A },
      data: { status: 'CANCELLED' },
    });
  });

  it('skips a goal_set with an unparseable target', async () => {
    await projectEvent(event('goal_set', [ADDR_A, 'not-a-number', 'x', '0']));
    expect(mockGoalUpsert).not.toHaveBeenCalled();
  });

  it('projects a goal_completed event with COMPLETED status', async () => {
    await projectEvent(event('goal_completed', [ADDR_A, '1735000000', '5000', '5000', '105']));
    expect(mockGoalUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'goal_u_' + ADDR_A },
        create: expect.objectContaining({
          id: 'goal_u_' + ADDR_A,
          userId: 'u_' + ADDR_A,
          targetStroops: 5000n,
          raisedStroops: 5000n,
          status: 'COMPLETED',
        }),
        update: { targetStroops: 5000n, raisedStroops: 5000n, status: 'COMPLETED' },
      }),
    );
  });

  it('publishes a realtime projection for goal_completed', async () => {
    await projectEvent(event('goal_completed', [ADDR_A, '1735000000', '5000', '5000', '105']));
    expect(mockPublishProjection).toHaveBeenCalledWith(
      'goal_completed',
      expect.objectContaining({
        userId: 'u_' + ADDR_A,
        targetStroops: '5000',
        raisedStroops: '5000',
      }),
    );
  });

  it('goal_completed is idempotent on replay', async () => {
    await projectEvent(event('goal_completed', [ADDR_A, '1735000000', '5000', '5000', '105']));
    await projectEvent(event('goal_completed', [ADDR_A, '1735000000', '5000', '5000', '105']));
    expect(mockGoalUpsert.mock.calls[0][0].update).toEqual(mockGoalUpsert.mock.calls[1][0].update);
  });

  it('skips a goal_completed with unparseable data', async () => {
    await projectEvent(event('goal_completed', [ADDR_A, 'x', 'not-a-number', '5000', '105']));
    expect(mockGoalUpsert).not.toHaveBeenCalled();
  });
});

describe('projectEvent — subscriptions (#900)', () => {
  it('creates a subscription mapping interval_days to an interval', async () => {
    await projectEvent(event('sub_created', [ADDR_A, ADDR_B, '500', 7]));
    expect(mockSubUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: `sub_u_${ADDR_A}_u_${ADDR_B}` },
        create: expect.objectContaining({
          tipperId: 'u_' + ADDR_A,
          creatorId: 'u_' + ADDR_B,
          amountStroops: 500n,
          interval: 'WEEKLY',
          status: 'ACTIVE',
        }),
      }),
    );
  });

  it('records a charge by keeping the subscription active', async () => {
    await projectEvent(event('sub_exec', [ADDR_A, ADDR_B, '500']));
    expect(mockSubUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: `sub_u_${ADDR_A}_u_${ADDR_B}` },
        update: { amountStroops: 500n, status: 'ACTIVE' },
      }),
    );
  });

  it('charge is idempotent — replay keys the same subscription', async () => {
    await projectEvent(event('sub_exec', [ADDR_A, ADDR_B, '500']));
    await projectEvent(event('sub_exec', [ADDR_A, ADDR_B, '500']));
    expect(mockSubUpsert.mock.calls[0][0].where).toEqual(mockSubUpsert.mock.calls[1][0].where);
    expect(mockSubUpsert.mock.calls[0][0].update).toEqual(mockSubUpsert.mock.calls[1][0].update);
  });

  it('cancels a subscription via updateMany', async () => {
    await projectEvent(event('sub_cancel', [ADDR_A, ADDR_B]));
    expect(mockSubUpdateMany).toHaveBeenCalledWith({
      where: { id: `sub_u_${ADDR_A}_u_${ADDR_B}` },
      data: { status: 'CANCELLED' },
    });
  });

  it('skips a sub_created with an unparseable amount', async () => {
    await projectEvent(event('sub_created', [ADDR_A, ADDR_B, 'nope', 7]));
    expect(mockSubUpsert).not.toHaveBeenCalled();
  });

  it('notifies the creator of a new charge (#965)', async () => {
    mockEventLogFindFirst.mockResolvedValue(null);
    await projectEvent(event('sub_exec', [ADDR_A, ADDR_B, '500']));
    expect(mockCreateNotification).toHaveBeenCalledWith('u_' + ADDR_B, 'subscription_charged', {
      tipperId: 'u_' + ADDR_A,
      amountStroops: '500',
    });
  });

  it('does not re-notify when replaying an already-logged charge (#965)', async () => {
    mockEventLogFindFirst.mockResolvedValueOnce(null).mockResolvedValueOnce({ id: 'existing' });
    await projectEvent(event('sub_exec', [ADDR_A, ADDR_B, '500']));
    await projectEvent(event('sub_exec', [ADDR_A, ADDR_B, '500']));
    expect(mockCreateNotification).toHaveBeenCalledTimes(1);
  });

  it('skips notifying when the charge event is unparseable', async () => {
    await projectEvent(event('sub_exec', [ADDR_A, ADDR_B, 'nope']));
    expect(mockCreateNotification).not.toHaveBeenCalled();
  });
});

describe('projectEvent — tip idempotency (#892)', () => {
  it('persists a new tip event and upserts the Tip row', async () => {
    mockEventLogFindFirst.mockResolvedValue(null);
    mockEventLogCreate.mockResolvedValue({});
    mockTipUpsert.mockResolvedValue({});

    await projectEvent(tipEvent);

    expect(mockEventLogCreate).toHaveBeenCalledOnce();
    expect(mockTipUpsert).toHaveBeenCalledOnce();
    expect(mockTipUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { txHash: tipEvent.txHash },
        update: {},
      }),
    );
  });

  it('skips duplicate event log on re-run over the same ledger', async () => {
    mockEventLogFindFirst.mockResolvedValue({ id: 'existing' });
    mockTipUpsert.mockResolvedValue({});

    await projectEvent(tipEvent);

    expect(mockEventLogCreate).not.toHaveBeenCalled();
    expect(mockTipUpsert).toHaveBeenCalledOnce();
  });

  it('produces no duplicate Tip rows when replayed over the same events', async () => {
    mockEventLogFindFirst.mockResolvedValueOnce(null);
    mockEventLogCreate.mockResolvedValueOnce({});
    mockTipUpsert.mockResolvedValueOnce({});
    await projectEvent(tipEvent);

    mockEventLogFindFirst.mockResolvedValueOnce({ id: 'existing' });
    mockTipUpsert.mockResolvedValueOnce({});
    await projectEvent(tipEvent);

    expect(mockEventLogCreate).toHaveBeenCalledTimes(1);
    expect(mockTipUpsert).toHaveBeenCalledTimes(2);
  });

  it('does not upsert a Tip for non-tip topics', async () => {
    mockEventLogFindFirst.mockResolvedValue(null);
    mockEventLogCreate.mockResolvedValue({});

    await projectEvent(nonTipEvent);

    expect(mockEventLogCreate).toHaveBeenCalledOnce();
    expect(mockTipUpsert).not.toHaveBeenCalled();
  });

  it('logs a warning and skips Tip upsert when value is unparseable', async () => {
    mockEventLogFindFirst.mockResolvedValue(null);
    mockEventLogCreate.mockResolvedValue({});

    const badEvent: DecodedEvent = { ...tipEvent, value: null };
    await expect(projectEvent(badEvent)).resolves.not.toThrow();
    expect(mockTipUpsert).not.toHaveBeenCalled();
  });

  it('handles tip topic alias "tip" the same as "tip_sent"', async () => {
    mockEventLogFindFirst.mockResolvedValue(null);
    mockEventLogCreate.mockResolvedValue({});
    mockTipUpsert.mockResolvedValue({});

    const aliasEvent: DecodedEvent = { ...tipEvent, topic: 'tip' };
    await projectEvent(aliasEvent);

    expect(mockTipUpsert).toHaveBeenCalledOnce();
  });
});

describe('projectEvent — credit score (#898)', () => {
  it('upserts the current credit score and appends to history', async () => {
    await projectEvent(event('credit_updated', [ADDR_A, 40, 65], { ledger: 200 }));

    expect(mockCreditScoreUpsert).toHaveBeenCalledWith({
      where: { userId: 'u_' + ADDR_A },
      create: expect.objectContaining({
        userId: 'u_' + ADDR_A,
        value: 65,
      }),
      update: expect.objectContaining({
        value: 65,
      }),
    });

    expect(mockCreditScoreHistoryUpsert).toHaveBeenCalledWith({
      where: { id: 'credit_history_u_' + ADDR_A + '_200' },
      create: expect.objectContaining({
        id: 'credit_history_u_' + ADDR_A + '_200',
        userId: 'u_' + ADDR_A,
        value: 65,
      }),
      update: {},
    });
  });

  it('is idempotent — replaying the same event produces no duplicates', async () => {
    await projectEvent(event('credit_updated', [ADDR_A, 40, 65], { ledger: 200 }));
    await projectEvent(event('credit_updated', [ADDR_A, 40, 65], { ledger: 200 }));

    expect(mockCreditScoreUpsert).toHaveBeenCalledTimes(2);
    expect(mockCreditScoreHistoryUpsert).toHaveBeenCalledTimes(2);

    const historyIds = mockCreditScoreHistoryUpsert.mock.calls.map((c) => c[0].where.id);
    expect(historyIds[0]).toEqual(historyIds[1]);
  });

  it('handles different score updates on different ledgers', async () => {
    await projectEvent(event('credit_updated', [ADDR_A, 40, 65], { ledger: 200 }));
    await projectEvent(event('credit_updated', [ADDR_A, 65, 75], { ledger: 300 }));

    expect(mockCreditScoreUpsert).toHaveBeenCalledTimes(2);
    expect(mockCreditScoreHistoryUpsert).toHaveBeenCalledTimes(2);

    const historyIds = mockCreditScoreHistoryUpsert.mock.calls.map((c) => c[0].where.id);
    expect(historyIds[0]).toEqual('credit_history_u_' + ADDR_A + '_200');
    expect(historyIds[1]).toEqual('credit_history_u_' + ADDR_A + '_300');
  });

  it('accepts numeric types for score values', async () => {
    await projectEvent(event('credit_updated', [ADDR_A, 40, 65], { ledger: 200 }));
    await projectEvent(event('credit_updated', [ADDR_A, '65', '75'], { ledger: 201 }));
    await projectEvent(event('credit_updated', [ADDR_A, BigInt(75), BigInt(80)], { ledger: 202 }));

    expect(mockCreditScoreUpsert).toHaveBeenCalledTimes(3);
    expect(mockCreditScoreHistoryUpsert).toHaveBeenCalledTimes(3);
  });

  it('skips an event with an unparseable creator address', async () => {
    await projectEvent(event('credit_updated', [123, 40, 65]));
    expect(mockCreditScoreUpsert).not.toHaveBeenCalled();
    expect(mockCreditScoreHistoryUpsert).not.toHaveBeenCalled();
  });

  it('skips an event with an unparseable new score', async () => {
    await projectEvent(event('credit_updated', [ADDR_A, 40, 'not-a-number']));
    expect(mockCreditScoreUpsert).not.toHaveBeenCalled();
    expect(mockCreditScoreHistoryUpsert).not.toHaveBeenCalled();
  });

  it('ensures the user exists before recording the score', async () => {
    await projectEvent(event('credit_updated', [ADDR_A, 40, 65]));
    expect(mockUserUpsert).toHaveBeenCalledWith(
      expect.objectContaining({ where: { stellarAddress: ADDR_A } }),
    );
  });
});

describe('projectEvent — refunds (#1038)', () => {
  beforeEach(() => {
    mockTipFindUnique.mockResolvedValue({ id: 'tip-1', status: 'CONFIRMED' });
    mockTipUpdate.mockResolvedValue({ id: 'tip-1', status: 'REFUNDED' });
  });

  it('upserts a refund when an on-chain refund event is received', async () => {
    mockEventLogFindFirst.mockResolvedValue(null);
    mockRefundUpsert.mockResolvedValue({
      id: 'refund-1',
      tipId: 'tip-1',
      amount: BigInt(5_000_000),
      reason: 'duplicate',
      status: 'completed',
      txHash: 'refund-tx-123',
    });

    const refundEvent: DecodedEvent = {
      ledger: 150,
      txHash: 'refund-tx-123',
      pagingToken: '150-0',
      topic: 'tip_refund',
      value: {
        tipTxHash: 'tip-tx-abc',
        amount: '5000000',
        reason: 'duplicate',
      },
    };

    await projectEvent(refundEvent);

    expect(mockTipFindUnique).toHaveBeenCalledWith({
      where: { txHash: 'tip-tx-abc' },
    });
    expect(mockRefundUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { tipId: 'tip-1' },
        create: expect.objectContaining({
          tipId: 'tip-1',
          amount: BigInt(5_000_000),
          reason: 'duplicate',
          status: 'completed',
          txHash: 'refund-tx-123',
        }),
      }),
    );
  });

  it('updates the tip status to REFUNDED when a refund is processed', async () => {
    mockEventLogFindFirst.mockResolvedValue(null);
    mockRefundUpsert.mockResolvedValue({
      id: 'refund-1',
      tipId: 'tip-1',
    });

    const refundEvent: DecodedEvent = {
      ledger: 150,
      txHash: 'refund-tx-123',
      pagingToken: '150-0',
      topic: 'tip_refund',
      value: ['tip-tx-abc', '5000000', 'duplicate'],
    };

    await projectEvent(refundEvent);

    expect(mockTipUpdate).toHaveBeenCalledWith({
      where: { id: 'tip-1' },
      data: { status: 'REFUNDED' },
    });
  });

  it('is idempotent — replaying a refund event does not duplicate the refund', async () => {
    mockEventLogFindFirst.mockResolvedValueOnce(null).mockResolvedValueOnce({ id: 'existing' });
    mockRefundUpsert.mockResolvedValue({
      id: 'refund-1',
      tipId: 'tip-1',
    });

    const refundEvent: DecodedEvent = {
      ledger: 150,
      txHash: 'refund-tx-123',
      pagingToken: '150-0',
      topic: 'tip_refund',
      value: ['tip-tx-abc', '5000000', 'duplicate'],
    };

    await projectEvent(refundEvent);
    await projectEvent(refundEvent);

    expect(mockRefundUpsert).toHaveBeenCalledTimes(2);
    const calls = mockRefundUpsert.mock.calls;
    expect(calls[0][0].where).toEqual(calls[1][0].where);
  });

  it('handles the "refund" topic alias the same as "tip_refund"', async () => {
    mockEventLogFindFirst.mockResolvedValue(null);
    mockRefundUpsert.mockResolvedValue({ id: 'refund-1', tipId: 'tip-1' });

    const refundEvent: DecodedEvent = {
      ledger: 150,
      txHash: 'refund-tx-123',
      pagingToken: '150-0',
      topic: 'refund',
      value: ['tip-tx-abc', '5000000', 'duplicate'],
    };

    await projectEvent(refundEvent);

    expect(mockRefundUpsert).toHaveBeenCalledOnce();
  });

  it('skips a refund event when the referenced tip is not found', async () => {
    mockEventLogFindFirst.mockResolvedValue(null);
    mockTipFindUnique.mockResolvedValue(null);

    const refundEvent: DecodedEvent = {
      ledger: 150,
      txHash: 'refund-tx-123',
      pagingToken: '150-0',
      topic: 'tip_refund',
      value: ['unknown-tip-tx', '5000000', 'duplicate'],
    };

    await projectEvent(refundEvent);

    expect(mockRefundUpsert).not.toHaveBeenCalled();
    expect(mockTipUpdate).not.toHaveBeenCalled();
  });

  it('skips a refund event with unparseable payload', async () => {
    mockEventLogFindFirst.mockResolvedValue(null);

    const refundEvent: DecodedEvent = {
      ledger: 150,
      txHash: 'refund-tx-123',
      pagingToken: '150-0',
      topic: 'tip_refund',
      value: { invalid: 'payload' },
    };

    await projectEvent(refundEvent);

    expect(mockRefundUpsert).not.toHaveBeenCalled();
  });

  it('accepts both struct and positional array formats for refund data', async () => {
    mockEventLogFindFirst.mockResolvedValueOnce(null).mockResolvedValueOnce(null);
    mockRefundUpsert.mockResolvedValue({ id: 'refund-1', tipId: 'tip-1' });

    const structEvent: DecodedEvent = {
      ledger: 150,
      txHash: 'refund-tx-struct',
      pagingToken: '150-0',
      topic: 'tip_refund',
      value: {
        tipTxHash: 'tip-tx-abc',
        amount: '5000000',
        reason: 'duplicate',
      },
    };

    const arrayEvent: DecodedEvent = {
      ledger: 151,
      txHash: 'refund-tx-array',
      pagingToken: '151-0',
      topic: 'tip_refund',
      value: ['tip-tx-abc', '5000000', 'duplicate'],
    };

    await projectEvent(structEvent);
    await projectEvent(arrayEvent);

    expect(mockRefundUpsert).toHaveBeenCalledTimes(2);
  });

  it('publishes the refund projection to realtime after processing', async () => {
    mockEventLogFindFirst.mockResolvedValue(null);
    mockRefundUpsert.mockResolvedValue({ id: 'refund-1', tipId: 'tip-1' });

    const refundEvent: DecodedEvent = {
      ledger: 150,
      txHash: 'refund-tx-123',
      pagingToken: '150-0',
      topic: 'tip_refund',
      value: ['tip-tx-abc', '5000000', 'duplicate'],
    };

    await projectEvent(refundEvent);

    expect(mockPublishProjection).toHaveBeenCalledWith(refundEvent);
  });
});