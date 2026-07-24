import type { DecodedEvent } from '../sorobanClient.js';

export const ADDR_A = 'GABC12345678901234567890123456789012345678901234567';
export const ADDR_B = 'GDEF12345678901234567890123456789012345678901234567';

/** Sample decoded tip event for indexer tests. */
export const tipSentEvent: DecodedEvent = {
  ledger: 100,
  txHash: 'fixture-tip-tx-001',
  pagingToken: '100-0',
  topic: 'tip_sent',
  value: { from: ADDR_A, to: ADDR_B, amount: '1000000', message: 'Thanks!' },
};

/** Sample decoded profile registration event for indexer tests. */
export const profileRegisterEvent: DecodedEvent = {
  ledger: 101,
  txHash: 'fixture-profile-tx-001',
  pagingToken: '101-0',
  topic: 'profile_register',
  value: [ADDR_A, 'alice'],
};

/** Sample decoded profile update event for indexer tests. */
export const profileUpdatedEvent: DecodedEvent = {
  ledger: 102,
  txHash: 'fixture-profile-update-tx-001',
  pagingToken: '102-0',
  topic: 'profile_updated',
  value: [ADDR_A],
};

/** Sample decoded goal_set event for indexer tests. */
export const goalSetEvent: DecodedEvent = {
  ledger: 103,
  txHash: 'fixture-goal-set-tx-001',
  pagingToken: '103-0',
  topic: 'goal_set',
  value: [ADDR_A, '5000000', 'Buy studio gear', '1735000000'],
};

/** Sample decoded goal_reached event for indexer tests. */
export const goalReachedEvent: DecodedEvent = {
  ledger: 104,
  txHash: 'fixture-goal-reached-tx-001',
  pagingToken: '104-0',
  topic: 'goal_reached',
  value: [ADDR_A, '5000000', '5000000'],
};

/** Sample decoded goal_cancel event for indexer tests. */
export const goalCancelEvent: DecodedEvent = {
  ledger: 105,
  txHash: 'fixture-goal-cancel-tx-001',
  pagingToken: '105-0',
  topic: 'goal_cancel',
  value: ADDR_A,
};

/** Sample decoded sub_created event for indexer tests. */
export const subCreatedEvent: DecodedEvent = {
  ledger: 106,
  txHash: 'fixture-sub-created-tx-001',
  pagingToken: '106-0',
  topic: 'sub_created',
  value: [ADDR_A, ADDR_B, '500000', 30],
};

/** Sample decoded sub_exec event for indexer tests. */
export const subExecEvent: DecodedEvent = {
  ledger: 107,
  txHash: 'fixture-sub-exec-tx-001',
  pagingToken: '107-0',
  topic: 'sub_exec',
  value: [ADDR_A, ADDR_B, '500000'],
};

/** Sample decoded sub_cancel event for indexer tests. */
export const subCancelEvent: DecodedEvent = {
  ledger: 108,
  txHash: 'fixture-sub-cancel-tx-001',
  pagingToken: '108-0',
  topic: 'sub_cancel',
  value: [ADDR_A, ADDR_B],
};

/** Sample decoded credit_updated event for indexer tests. */
export const creditUpdatedEvent: DecodedEvent = {
  ledger: 109,
  txHash: 'fixture-credit-tx-001',
  pagingToken: '109-0',
  topic: 'credit_updated',
  value: [ADDR_A, 40, 65],
};

/** Page of fixture events returned by a mocked Soroban RPC client. */
export const fixtureEventPage = {
  events: [tipSentEvent, profileRegisterEvent],
  latestLedger: 101,
};

/**
 * Full multi-event fixture page covering every projection topic.
 * Used to test that replaying the same ledger range produces no duplicates.
 */
export const fullFixtureEventPage = {
  events: [
    tipSentEvent,
    profileRegisterEvent,
    profileUpdatedEvent,
    goalSetEvent,
    goalReachedEvent,
    subCreatedEvent,
    subExecEvent,
    creditUpdatedEvent,
  ],
  latestLedger: 109,
};