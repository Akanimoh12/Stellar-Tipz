import { describe, expect, it, vi, beforeEach } from 'vitest';
import { projectEvent } from './projections.js';
import type { DecodedEvent } from './sorobanClient.js';

const {
  mockUserUpsert,
  mockGoalUpsert,
  mockGoalUpdateMany,
  mockSubUpsert,
  mockSubUpdateMany,
  mockTipUpsert,
  mockEventLogFindFirst,
  mockEventLogCreate,
} = vi.hoisted(() => ({
  mockUserUpsert: vi.fn(),
  mockGoalUpsert: vi.fn(),
  mockGoalUpdateMany: vi.fn(),
  mockSubUpsert: vi.fn(),
  mockSubUpdateMany: vi.fn(),
  mockTipUpsert: vi.fn(),
  mockEventLogFindFirst: vi.fn(),
  mockEventLogCreate: vi.fn(),
}));

vi.mock('../db/prisma.js', () => ({
  prisma: {
    user: { upsert: mockUserUpsert },
    goal: { upsert: mockGoalUpsert, updateMany: mockGoalUpdateMany },
    subscription: { upsert: mockSubUpsert, updateMany: mockSubUpdateMany },
    tip: { upsert: mockTipUpsert },
    eventLog: { findFirst: mockEventLogFindFirst, create: mockEventLogCreate },
  },
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
  mockSubUpsert.mockResolvedValue({});
  mockSubUpdateMany.mockResolvedValue({ count: 1 });
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
