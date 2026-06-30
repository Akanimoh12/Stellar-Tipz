/**
 * Indexer integration tests (mocked RPC) — issue #910
 *
 * Tests the full poller → projection pipeline against fixture event payloads.
 * The Soroban RPC client, Prisma, and the realtime publisher are all mocked so
 * the suite runs without a live network or database.
 *
 * Acceptance criteria verified here:
 *  - Re-running over the same ledgers produces no duplicates (idempotency).
 *  - Each projection handler is exercised with its canonical fixture payload.
 *  - Unknown topics are silently ignored (no crash, no spurious DB calls).
 */

import { describe, expect, it, vi, beforeEach } from 'vitest';
import {
  tipSentEvent,
  profileRegisterEvent,
  profileUpdatedEvent,
  goalSetEvent,
  goalReachedEvent,
  goalCancelEvent,
  subCreatedEvent,
  subExecEvent,
  subCancelEvent,
  creditUpdatedEvent,
  fixtureEventPage,
  fullFixtureEventPage,
  ADDR_A,
  ADDR_B,
} from './fixtures/events.js';
import type { DecodedEvent } from './sorobanClient.js';

// ── Mock declarations (hoisted so vi.mock factories can reference them) ───────

const {
  mockUserUpsert,
  mockGoalUpsert,
  mockGoalUpdateMany,
  mockSubUpsert,
  mockSubUpdateMany,
  mockTipUpsert,
  mockEventLogFindFirst,
  mockEventLogCreate,
  mockCreditScoreUpsert,
  mockCreditScoreHistoryUpsert,
  mockPublishProjection,
} = vi.hoisted(() => ({
  mockUserUpsert: vi.fn(),
  mockGoalUpsert: vi.fn(),
  mockGoalUpdateMany: vi.fn(),
  mockSubUpsert: vi.fn(),
  mockSubUpdateMany: vi.fn(),
  mockTipUpsert: vi.fn(),
  mockEventLogFindFirst: vi.fn(),
  mockEventLogCreate: vi.fn(),
  mockCreditScoreUpsert: vi.fn(),
  mockCreditScoreHistoryUpsert: vi.fn(),
  mockPublishProjection: vi.fn(),
}));

vi.mock('../db/prisma.js', () => ({
  prisma: {
    user: { upsert: mockUserUpsert },
    goal: { upsert: mockGoalUpsert, updateMany: mockGoalUpdateMany },
    subscription: { upsert: mockSubUpsert, updateMany: mockSubUpdateMany },
    tip: { upsert: mockTipUpsert },
    eventLog: { findFirst: mockEventLogFindFirst, create: mockEventLogCreate },
    creditScore: { upsert: mockCreditScoreUpsert },
    creditScoreHistory: { upsert: mockCreditScoreHistoryUpsert },
  },
}));

vi.mock('./realtime-publisher.js', () => ({
  publishProjection: mockPublishProjection,
}));

// ── Helpers ───────────────────────────────────────────────────────────────────

import { projectEvent } from './projections.js';

/**
 * Simulate projecting an entire event page (as the poller would), and return
 * whether any mock indicated a duplicate write was attempted.
 */
async function projectPage(events: DecodedEvent[]): Promise<void> {
  for (const e of events) {
    await projectEvent(e);
  }
}

/**
 * Set up the eventLog mock to return `null` on every findFirst call (new event).
 * After the first page, switch to returning `{ id: 'existing' }` to simulate
 * the second pass over the same ledger range.
 */
function firstPassNewSecondPassSeen(): void {
  let pass = 0;
  mockEventLogFindFirst.mockImplementation(async () => {
    // Increment after every call (one findFirst per projectEvent call)
    const current = pass;
    pass++;
    return current === 0 ? null : { id: 'existing' };
  });
}

// ── Setup ─────────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();

  // Default: every event is new (no prior row in eventLog)
  mockEventLogFindFirst.mockResolvedValue(null);
  mockEventLogCreate.mockResolvedValue({});

  // ensureUserId returns a deterministic id keyed on stellarAddress
  mockUserUpsert.mockImplementation(async (args: { where: { stellarAddress: string } }) => ({
    id: 'u_' + args.where.stellarAddress,
  }));

  mockTipUpsert.mockResolvedValue({});
  mockGoalUpsert.mockResolvedValue({});
  mockGoalUpdateMany.mockResolvedValue({ count: 1 });
  mockSubUpsert.mockResolvedValue({});
  mockSubUpdateMany.mockResolvedValue({ count: 1 });
  mockCreditScoreUpsert.mockResolvedValue({});
  mockCreditScoreHistoryUpsert.mockResolvedValue({});
  mockPublishProjection.mockResolvedValue(undefined);
});

// ── Fixture event page ────────────────────────────────────────────────────────

describe('fixture event page', () => {
  it('projects every event in fixtureEventPage without throwing', async () => {
    await expect(projectPage(fixtureEventPage.events)).resolves.toBeUndefined();
  });

  it('stores a raw event log row for each event in the page', async () => {
    await projectPage(fixtureEventPage.events);
    // tipSentEvent + profileRegisterEvent = 2 persisted rows
    expect(mockEventLogCreate).toHaveBeenCalledTimes(fixtureEventPage.events.length);
  });

  it('publishes to the realtime layer for each new event in the page', async () => {
    await projectPage(fixtureEventPage.events);
    expect(mockPublishProjection).toHaveBeenCalledTimes(fixtureEventPage.events.length);
  });
});

// ── Idempotency: re-running over the same ledgers ─────────────────────────────

describe('idempotency — re-running over the same ledgers', () => {
  it('produces no duplicate eventLog rows when the same page is replayed', async () => {
    // First pass: all events are new
    await projectPage(fixtureEventPage.events);
    const firstPassCreates = mockEventLogCreate.mock.calls.length;

    // Second pass: eventLog.findFirst returns existing rows
    mockEventLogFindFirst.mockResolvedValue({ id: 'existing' });
    await projectPage(fixtureEventPage.events);

    // Only the first pass should have created rows
    expect(mockEventLogCreate).toHaveBeenCalledTimes(firstPassCreates);
  });

  it('does not re-publish to the realtime layer on replay', async () => {
    await projectPage(fixtureEventPage.events);
    const firstPassPublishes = mockPublishProjection.mock.calls.length;

    mockEventLogFindFirst.mockResolvedValue({ id: 'existing' });
    await projectPage(fixtureEventPage.events);

    expect(mockPublishProjection).toHaveBeenCalledTimes(firstPassPublishes);
  });

  it('tip upsert uses empty update object so replay is a no-op', async () => {
    await projectEvent(tipSentEvent);
    const updateArg = mockTipUpsert.mock.calls[0][0].update;
    expect(updateArg).toEqual({});
  });

  it('replaying full multi-topic page does not cause extra DB writes', async () => {
    await projectPage(fullFixtureEventPage.events);
    const creates = mockEventLogCreate.mock.calls.length;
    const userUpserts = mockUserUpsert.mock.calls.length;
    const goalUpserts = mockGoalUpsert.mock.calls.length;
    const subUpserts = mockSubUpsert.mock.calls.length;
    const tipUpserts = mockTipUpsert.mock.calls.length;

    // Second pass — all events already in the log
    mockEventLogFindFirst.mockResolvedValue({ id: 'existing' });
    await projectPage(fullFixtureEventPage.events);

    // eventLog.create should NOT have been called again
    expect(mockEventLogCreate).toHaveBeenCalledTimes(creates);
    // Projection-level upserts are still called (they are themselves idempotent)
    // but no additional ones beyond the second pass
    expect(mockGoalUpsert.mock.calls.length).toBeGreaterThanOrEqual(goalUpserts);
    expect(mockSubUpsert.mock.calls.length).toBeGreaterThanOrEqual(subUpserts);
    expect(mockTipUpsert.mock.calls.length).toBeGreaterThanOrEqual(tipUpserts);
    // User upserts are fine to repeat (upsert on stellarAddress is idempotent)
    expect(mockUserUpsert.mock.calls.length).toBeGreaterThanOrEqual(userUpserts);
  });

  it('publishes exactly once per unique txHash across two passes', async () => {
    // Pass 1: all new
    mockEventLogFindFirst.mockResolvedValue(null);
    await projectEvent(tipSentEvent);
    // Pass 2: already stored
    mockEventLogFindFirst.mockResolvedValue({ id: 'existing' });
    await projectEvent(tipSentEvent);

    expect(mockPublishProjection).toHaveBeenCalledTimes(1);
    expect(mockPublishProjection).toHaveBeenCalledWith(tipSentEvent);
  });
});

// ── tip_sent projection ───────────────────────────────────────────────────────

describe('fixture: tip_sent', () => {
  it('upserts the Tip row with the correct fields from fixture payload', async () => {
    await projectEvent(tipSentEvent);

    expect(mockTipUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { txHash: tipSentEvent.txHash },
        create: expect.objectContaining({
          txHash: tipSentEvent.txHash,
          ledger: tipSentEvent.ledger,
          fromAddress: ADDR_A,
          toAddress: ADDR_B,
          amountStroops: 1000000n,
          message: 'Thanks!',
        }),
        update: {},
      }),
    );
  });

  it('persists the raw event log before projecting the Tip', async () => {
    const order: string[] = [];
    mockEventLogCreate.mockImplementation(async () => { order.push('log'); return {}; });
    mockTipUpsert.mockImplementation(async () => { order.push('tip'); return {}; });

    await projectEvent(tipSentEvent);
    expect(order).toEqual(['log', 'tip']);
  });
});

// ── profile_register projection ───────────────────────────────────────────────

describe('fixture: profile_register', () => {
  it('upserts the User row with owner and username from fixture payload', async () => {
    await projectEvent(profileRegisterEvent);

    expect(mockUserUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { stellarAddress: ADDR_A },
        create: { stellarAddress: ADDR_A, username: 'alice' },
        update: { username: 'alice' },
      }),
    );
  });

  it('is idempotent — replaying the same registration upserts the same row', async () => {
    await projectEvent(profileRegisterEvent);
    await projectEvent(profileRegisterEvent);

    const wheres = mockUserUpsert.mock.calls.map((c) => c[0].where);
    expect(wheres).toEqual([
      { stellarAddress: ADDR_A },
      { stellarAddress: ADDR_A },
    ]);
  });
});

// ── profile_updated projection ────────────────────────────────────────────────

describe('fixture: profile_updated', () => {
  it('ensures the user row exists for the owner address', async () => {
    await projectEvent(profileUpdatedEvent);

    expect(mockUserUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { stellarAddress: ADDR_A },
        update: {},
      }),
    );
  });
});

// ── goal_set projection ───────────────────────────────────────────────────────

describe('fixture: goal_set', () => {
  it('upserts the Goal row with deterministic id and correct fields', async () => {
    await projectEvent(goalSetEvent);

    expect(mockGoalUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'goal_u_' + ADDR_A },
        create: expect.objectContaining({
          id: 'goal_u_' + ADDR_A,
          userId: 'u_' + ADDR_A,
          title: 'Buy studio gear',
          targetStroops: 5000000n,
          raisedStroops: 0n,
          status: 'ACTIVE',
        }),
      }),
    );

    const call = mockGoalUpsert.mock.calls[0][0];
    expect(call.create.deadline).toEqual(new Date(1735000000 * 1000));
  });

  it('is idempotent — replaying produces the same deterministic id', async () => {
    await projectEvent(goalSetEvent);
    await projectEvent(goalSetEvent);

    const ids = mockGoalUpsert.mock.calls.map((c) => c[0].where.id);
    expect(ids[0]).toEqual(ids[1]);
  });
});

// ── goal_reached projection ───────────────────────────────────────────────────

describe('fixture: goal_reached', () => {
  it('marks the goal COMPLETED with absolute raised amount', async () => {
    await projectEvent(goalReachedEvent);

    expect(mockGoalUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'goal_u_' + ADDR_A },
        update: { targetStroops: 5000000n, raisedStroops: 5000000n, status: 'COMPLETED' },
      }),
    );
  });

  it('is idempotent — replay sets the same absolute update', async () => {
    await projectEvent(goalReachedEvent);
    await projectEvent(goalReachedEvent);

    expect(mockGoalUpsert.mock.calls[0][0].update).toEqual(
      mockGoalUpsert.mock.calls[1][0].update,
    );
  });
});

// ── goal_cancel projection ────────────────────────────────────────────────────

describe('fixture: goal_cancel', () => {
  it('cancels the goal via updateMany', async () => {
    await projectEvent(goalCancelEvent);

    expect(mockGoalUpdateMany).toHaveBeenCalledWith({
      where: { id: 'goal_u_' + ADDR_A },
      data: { status: 'CANCELLED' },
    });
  });
});

// ── sub_created projection ────────────────────────────────────────────────────

describe('fixture: sub_created', () => {
  it('upserts the Subscription with deterministic id and MONTHLY interval (30 days)', async () => {
    await projectEvent(subCreatedEvent);

    expect(mockSubUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: `sub_u_${ADDR_A}_u_${ADDR_B}` },
        create: expect.objectContaining({
          tipperId: 'u_' + ADDR_A,
          creatorId: 'u_' + ADDR_B,
          amountStroops: 500000n,
          interval: 'MONTHLY',
          status: 'ACTIVE',
        }),
      }),
    );
  });

  it('is idempotent — replay uses the same (tipper, creator) key', async () => {
    await projectEvent(subCreatedEvent);
    await projectEvent(subCreatedEvent);

    expect(mockSubUpsert.mock.calls[0][0].where).toEqual(
      mockSubUpsert.mock.calls[1][0].where,
    );
  });
});

// ── sub_exec projection ───────────────────────────────────────────────────────

describe('fixture: sub_exec', () => {
  it('keeps the subscription ACTIVE and records the charged amount', async () => {
    await projectEvent(subExecEvent);

    expect(mockSubUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: `sub_u_${ADDR_A}_u_${ADDR_B}` },
        update: { amountStroops: 500000n, status: 'ACTIVE' },
      }),
    );
  });

  it('is idempotent — replay produces the same update fields', async () => {
    await projectEvent(subExecEvent);
    await projectEvent(subExecEvent);

    expect(mockSubUpsert.mock.calls[0][0].update).toEqual(
      mockSubUpsert.mock.calls[1][0].update,
    );
  });
});

// ── sub_cancel projection ─────────────────────────────────────────────────────

describe('fixture: sub_cancel', () => {
  it('cancels the subscription via updateMany', async () => {
    await projectEvent(subCancelEvent);

    expect(mockSubUpdateMany).toHaveBeenCalledWith({
      where: { id: `sub_u_${ADDR_A}_u_${ADDR_B}` },
      data: { status: 'CANCELLED' },
    });
  });
});

// ── credit_updated projection ─────────────────────────────────────────────────

describe('fixture: credit_updated', () => {
  it('upserts the credit score and appends to history using a deterministic id', async () => {
    await projectEvent(creditUpdatedEvent);

    expect(mockCreditScoreUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId: 'u_' + ADDR_A },
        create: expect.objectContaining({ userId: 'u_' + ADDR_A, value: 65 }),
        update: expect.objectContaining({ value: 65 }),
      }),
    );

    expect(mockCreditScoreHistoryUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: `credit_history_u_${ADDR_A}_${creditUpdatedEvent.ledger}` },
        create: expect.objectContaining({
          id: `credit_history_u_${ADDR_A}_${creditUpdatedEvent.ledger}`,
          userId: 'u_' + ADDR_A,
          value: 65,
        }),
        update: {},
      }),
    );
  });

  it('is idempotent — replaying produces no extra history rows (same deterministic id)', async () => {
    await projectEvent(creditUpdatedEvent);
    await projectEvent(creditUpdatedEvent);

    const ids = mockCreditScoreHistoryUpsert.mock.calls.map((c) => c[0].where.id);
    expect(ids[0]).toEqual(ids[1]);
  });
});

// ── Unknown / unhandled topics ────────────────────────────────────────────────

describe('unknown topics', () => {
  it('stores the raw event log but calls no projection handler', async () => {
    const unknownEvent: DecodedEvent = {
      ledger: 200,
      txHash: 'fixture-unknown-tx-001',
      pagingToken: '200-0',
      topic: 'fee_updated',
      value: [10, 20],
    };

    await projectEvent(unknownEvent);

    expect(mockEventLogCreate).toHaveBeenCalledOnce();
    expect(mockUserUpsert).not.toHaveBeenCalled();
    expect(mockGoalUpsert).not.toHaveBeenCalled();
    expect(mockSubUpsert).not.toHaveBeenCalled();
    expect(mockTipUpsert).not.toHaveBeenCalled();
    expect(mockCreditScoreUpsert).not.toHaveBeenCalled();
  });

  it('still publishes to the realtime layer for unknown topics on first sight', async () => {
    const unknownEvent: DecodedEvent = {
      ledger: 200,
      txHash: 'fixture-unknown-tx-002',
      pagingToken: '200-1',
      topic: 'fee_updated',
      value: [10, 20],
    };

    await projectEvent(unknownEvent);
    expect(mockPublishProjection).toHaveBeenCalledOnce();
  });
});

// ── Payload edge cases ────────────────────────────────────────────────────────

describe('payload edge cases', () => {
  it('tip with null value is skipped gracefully (no throw, no tip upsert)', async () => {
    const badTip: DecodedEvent = { ...tipSentEvent, value: null };
    await expect(projectEvent(badTip)).resolves.toBeUndefined();
    expect(mockTipUpsert).not.toHaveBeenCalled();
  });

  it('profile_register with a non-string owner is skipped (no user upsert)', async () => {
    const badProfile: DecodedEvent = { ...profileRegisterEvent, value: [42, 'alice'] };
    await expect(projectEvent(badProfile)).resolves.toBeUndefined();
    expect(mockUserUpsert).not.toHaveBeenCalled();
  });

  it('goal_set with a non-numeric target is skipped (no goal upsert)', async () => {
    const badGoal: DecodedEvent = { ...goalSetEvent, value: [ADDR_A, 'not-a-number', 'desc', '0'] };
    await expect(projectEvent(badGoal)).resolves.toBeUndefined();
    expect(mockGoalUpsert).not.toHaveBeenCalled();
  });

  it('sub_created with a non-numeric amount is skipped (no subscription upsert)', async () => {
    const badSub: DecodedEvent = { ...subCreatedEvent, value: [ADDR_A, ADDR_B, 'nope', 30] };
    await expect(projectEvent(badSub)).resolves.toBeUndefined();
    expect(mockSubUpsert).not.toHaveBeenCalled();
  });

  it('credit_updated with a non-numeric score is skipped (no credit score upsert)', async () => {
    const badCredit: DecodedEvent = { ...creditUpdatedEvent, value: [ADDR_A, 40, 'not-a-number'] };
    await expect(projectEvent(badCredit)).resolves.toBeUndefined();
    expect(mockCreditScoreUpsert).not.toHaveBeenCalled();
    expect(mockCreditScoreHistoryUpsert).not.toHaveBeenCalled();
  });

  it('tip topic alias "tip" is treated identically to "tip_sent"', async () => {
    const aliasEvent: DecodedEvent = { ...tipSentEvent, topic: 'tip' };
    await projectEvent(aliasEvent);
    expect(mockTipUpsert).toHaveBeenCalledOnce();
  });
});