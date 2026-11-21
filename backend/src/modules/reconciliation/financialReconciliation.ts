import { prisma } from '../../db/prisma.js';
import { logger } from '../../common/utils/logger.js';
import { createCounter, createGauge } from '../../common/observability/prometheus.js';

type LedgerEvent = { topic: string; txHash: string; data: unknown };
type TipRecord = { txHash: string; amountStroops: bigint; status: string };
type WithdrawalRecord = { txHash: string | null; amount: bigint; fee: bigint; status: string };
type RefundRecord = { txHash: string | null; amount: bigint; status: string };
export type Difference = { category: string; txHash: string; reason: string; expected: string; observed: string };
export type FinancialReport = {
  day: string; status: 'reconciled' | 'discrepancy' | 'unverifiable';
  totals: Record<string, string>; discrepancies: Difference[];
  generatedAt: string; onChainSource: 'indexed_contract_events';
};

const discrepanciesTotal = createCounter({
  name: 'financial_reconciliation_discrepancies_total',
  help: 'New financial reconciliation mismatches by category',
  labelNames: ['category'] as const,
});
const unresolvedGauge = createGauge({
  name: 'financial_reconciliation_unresolved',
  help: 'Number of discrepancies in the latest daily financial report',
});
const verified = createGauge({
  name: 'financial_reconciliation_verified',
  help: 'Whether the latest daily report has proven complete ledger coverage and matching balances',
});
const lastSuccess = createGauge({
  name: 'financial_reconciliation_last_success_timestamp_seconds',
  help: 'Last day for which financial records reconciled successfully',
});
const TOLERANCE_STROOPS = 1n;

function integer(value: unknown): bigint | null {
  if (typeof value === 'bigint') return value;
  if (typeof value === 'number' && Number.isSafeInteger(value)) return BigInt(value);
  if (typeof value === 'string' && /^-?\d+$/.test(value)) return BigInt(value);
  return null;
}
function tuple(data: unknown): unknown[] {
  return Array.isArray(data) ? data : [];
}

/** Contract uses fee=max(floor(gross*bps/10000),1) for non-zero bps. */
export function contractFee(gross: bigint, bps: bigint): bigint {
  if (gross < 0n || bps < 0n || bps > 1000n) throw new Error('Invalid fee inputs');
  return bps === 0n ? 0n : (gross * bps / 10000n > 0n ? gross * bps / 10000n : 1n);
}

/**
 * Pure checker. Chain events are independent of the off-chain withdrawal/tip
 * tables, but are still subject to indexer lag: never mark an unindexed day clean.
 */
export function compareFinancialDay(
  day: string, events: LedgerEvent[], tips: TipRecord[], withdrawals: WithdrawalRecord[], refunds: RefundRecord[],
  complete: boolean,
): FinancialReport {
  const discrepancies: Difference[] = [];
  const mismatch = (category: string, txHash: string, reason: string, expected: unknown, observed: unknown) =>
    discrepancies.push({ category, txHash, reason, expected: String(expected), observed: String(observed) });
  const byHash = (items: { txHash: string | null }[]) => new Map(items.filter((i) => i.txHash).map((i) => [i.txHash!, i]));
  const tipRows = byHash(tips);
  const withdrawalRows = byHash(withdrawals);
  const refundRows = byHash(refunds);
  const observedTips = new Set<string>(), observedWithdrawals = new Set<string>(), observedRefunds = new Set<string>();
  const feeEvents = events.filter((event) => event.topic === 'fee_collected');
  const totals: Record<string, bigint> = { tipStroops: 0n, withdrawalStroops: 0n, refundStroops: 0n, feeStroops: 0n };
  let unverifiable = !complete;

  for (const event of events) {
    const data = tuple(event.data);
    if (event.topic === 'tip_sent' || event.topic === 'tip') {
      const amount = integer(data[0] === 1 || data[0] === '1' ? data[4] : data[2]);
      const record = tipRows.get(event.txHash) as TipRecord | undefined;
      observedTips.add(event.txHash);
      if (amount === null) { unverifiable = true; mismatch('tip', event.txHash, 'unparseable event', 'valid amount', 'invalid'); continue; }
      totals.tipStroops += amount;
      if (!record) mismatch('tip', event.txHash, 'on-chain tip missing off-chain', amount, 'missing');
      else if (record.amountStroops !== amount) mismatch('tip', event.txHash, 'tip amount mismatch', amount, record.amountStroops);
    }
    if (event.topic === 'tip_withdrawn') {
      const amount = integer(data[0] === 1 || data[0] === '1' ? data[2] : data[1]);
      const record = withdrawalRows.get(event.txHash) as WithdrawalRecord | undefined;
      observedWithdrawals.add(event.txHash);
      if (amount === null) { unverifiable = true; mismatch('withdrawal', event.txHash, 'unparseable event', 'valid amount', 'invalid'); continue; }
      totals.withdrawalStroops += amount;
      if (!record) mismatch('withdrawal', event.txHash, 'on-chain withdrawal missing off-chain', amount, 'missing');
      else if (record.amount !== amount) mismatch('withdrawal', event.txHash, 'gross amount mismatch', amount, record.amount);
    }
    if (event.topic === 'tip_refund' || event.topic === 'refund') {
      const amount = integer(data[1]);
      const record = refundRows.get(event.txHash) as RefundRecord | undefined;
      observedRefunds.add(event.txHash);
      if (amount === null) { unverifiable = true; mismatch('refund', event.txHash, 'unparseable event', 'valid amount', 'invalid'); continue; }
      totals.refundStroops += amount;
      if (!record) mismatch('refund', event.txHash, 'on-chain refund missing off-chain', amount, 'missing');
      else if (record.amount !== amount) mismatch('refund', event.txHash, 'refund amount mismatch', amount, record.amount);
    }
  }
  for (const tip of tips) if (!observedTips.has(tip.txHash) && tip.status === 'CONFIRMED')
    mismatch('tip', tip.txHash, 'off-chain confirmed tip missing on-chain event', 'present', 'missing');
  for (const withdrawal of withdrawals) if (withdrawal.txHash && withdrawal.status === 'CONFIRMED' && !observedWithdrawals.has(withdrawal.txHash))
    mismatch('withdrawal', withdrawal.txHash, 'confirmed withdrawal lacks on-chain event', 'present', 'missing');
  for (const refund of refunds) if (refund.txHash && refund.status === 'completed' && !observedRefunds.has(refund.txHash))
    mismatch('refund', refund.txHash, 'completed refund lacks on-chain event', 'present', 'missing');

  for (const event of feeEvents) {
    const values = tuple(event.data);
    const fee = integer(values[3]), gross = integer(values[2]), net = integer(values[4]), bps = integer(values[5]);
    if (fee === null || gross === null || net === null || bps === null) {
      unverifiable = true; mismatch('fee', event.txHash, 'malformed fee event', 'valid fee tuple', 'invalid'); continue;
    }
    totals.feeStroops += fee;
    if (gross - net !== fee) mismatch('fee', event.txHash, 'gross-net-fee conservation violation', fee, gross - net);
    try {
      const calculated = contractFee(gross, bps);
      if (calculated > fee + TOLERANCE_STROOPS || fee > calculated + TOLERANCE_STROOPS)
        mismatch('fee', event.txHash, 'fee does not match on-chain basis points', calculated, fee);
    } catch {
      mismatch('fee', event.txHash, 'invalid fee bps or gross', '0..1000 bps and nonnegative gross', bps);
    }
    const matchingWithdrawal = withdrawalRows.get(event.txHash) as WithdrawalRecord | undefined;
    if (matchingWithdrawal && matchingWithdrawal.fee !== fee)
      mismatch('fee', event.txHash, 'recorded fee differs from on-chain fee', fee, matchingWithdrawal.fee);
  }
  for (const withdrawal of withdrawals) {
    if (withdrawal.status === 'CONFIRMED' && withdrawal.txHash && !feeEvents.some((e) => e.txHash === withdrawal.txHash))
      mismatch('fee', withdrawal.txHash, 'confirmed withdrawal has no fee event', 'present', 'missing');
  }
  return {
    day, status: unverifiable ? 'unverifiable' : discrepancies.length ? 'discrepancy' : 'reconciled',
    totals: Object.fromEntries(Object.entries(totals).map(([key, value]) => [key, value.toString()])),
    discrepancies, generatedAt: new Date().toISOString(), onChainSource: 'indexed_contract_events',
  };
}

/** UTC dates only. Cron should run after sufficient indexing finality/catch-up time. */
export async function runDailyFinancialReconciliation(day: string): Promise<FinancialReport> {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) throw new Error('Expected UTC YYYY-MM-DD');
  const start = new Date(`${day}T00:00:00.000Z`);
  if (Number.isNaN(start.getTime()) || start.toISOString().slice(0, 10) !== day) throw new Error('Invalid date');
  const end = new Date(start.getTime() + 86400000);
  if (end.getTime() > Date.now()) throw new Error('Cannot reconcile an incomplete UTC day');
  const within = { gte: start, lt: end };
  const [events, tips, withdrawals, refunds] = await Promise.all([
    prisma.eventLog.findMany({ where: { createdAt: within }, select: { topic: true, txHash: true, data: true } }),
    prisma.tip.findMany({ where: { createdAt: within }, select: { txHash: true, amountStroops: true, status: true } }),
    prisma.withdrawal.findMany({ where: { requestedAt: within }, select: { txHash: true, amount: true, fee: true, status: true } }),
    prisma.refund.findMany({ where: { createdAt: within }, select: { txHash: true, amount: true, status: true } }),
  ]);
  // EventLog.createdAt is *index time*, not ledger time. Therefore even a
  // complete calendar day cannot be proven complete from this table alone.
  // Fail closed until ledger timestamps are persisted and backfill coverage
  // is verified by the indexer; never mark these reports reconciled prematurely.
  const report = compareFinancialDay(day, events, tips, withdrawals, refunds, false);
  await prisma.auditLog.create({
    data: {
      action: 'financial_reconciliation', actorType: 'system', actorId: 'financial-reconciliation',
      trigger: 'scheduled', input: JSON.parse(JSON.stringify(report)), outcome: report.status === 'reconciled' ? 'success' : 'failure',
      resourceId: day, resourceType: 'financial_report',
    },
  });
  unresolvedGauge.set(report.discrepancies.length);
  verified.set(report.status === 'reconciled' ? 1 : 0);
  for (const diff of report.discrepancies) discrepanciesTotal.inc({ category: diff.category });
  if (report.status === 'reconciled') lastSuccess.set(Date.now() / 1000);
  else logger.error({ day, status: report.status, discrepancies: report.discrepancies },
    'Financial reconciliation requires manual review');
  return report;
}
