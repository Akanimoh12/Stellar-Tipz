import type { DecodedEvent } from '../sorobanClient.js';

const ADDR_A = 'GABC12345678901234567890123456789012345678901234567';
const ADDR_B = 'GDEF12345678901234567890123456789012345678901234567';

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

/** Page of fixture events returned by a mocked Soroban RPC client. */
export const fixtureEventPage = {
  events: [tipSentEvent, profileRegisterEvent],
  latestLedger: 101,
};
