import { describe, expect, it } from 'vitest';
import { compareFinancialDay, contractFee } from './financialReconciliation.js';

const day = '2026-10-15';
describe('financial reconciliation', () => {
  it('matches contract min-one-stroop fee rounding', () => {
    expect(contractFee(49n, 200n)).toBe(1n);
    expect(contractFee(10000n, 200n)).toBe(200n);
    expect(contractFee(10000n, 0n)).toBe(0n);
  });
  it('reconciles matched withdrawal, fee, tip and refund events', () => {
    const report = compareFinancialDay(day, [
      { topic: 'tip_sent', txHash: 'tip-tx', data: [1, 12, 'from', 'to', '100'] },
      { topic: 'tip_withdrawn', txHash: 'withdraw-tx', data: [1, 'user', '49', '1'] },
      { topic: 'fee_collected', txHash: 'withdraw-tx', data: ['withdrawal', 'user', '49', '1', '48', 200] },
      { topic: 'tip_refund', txHash: 'refund-tx', data: ['tip-tx', '30'] },
    ], [{ txHash: 'tip-tx', amountStroops: 100n, status: 'CONFIRMED' }],
    [{ txHash: 'withdraw-tx', amount: 49n, fee: 1n, status: 'CONFIRMED' }],
    [{ txHash: 'refund-tx', amount: 30n, status: 'completed' }], true);
    expect(report.status).toBe('reconciled');
    expect(report.discrepancies).toHaveLength(0);
  });
  it('identifies offchain mismatches by transaction hash', () => {
    const report = compareFinancialDay(day, [
      { topic: 'fee_collected', txHash: 'tx2', data: ['withdrawal', 'user', '100', '2', '98', 200] },
      { topic: 'tip_withdrawn', txHash: 'tx2', data: [1, 'user', '100', '2'] },
    ], [], [{ txHash: 'tx2', amount: 100n, fee: 3n, status: 'CONFIRMED' }], [], true);
    expect(report.status).toBe('discrepancy');
    expect(report.discrepancies.some((d) => d.category === 'fee' && d.txHash === 'tx2')).toBe(true);
  });
  it('never declares an incomplete ledger snapshot reconciled', () => {
    expect(compareFinancialDay(day, [], [], [], [], false).status).toBe('unverifiable');
  });
});
