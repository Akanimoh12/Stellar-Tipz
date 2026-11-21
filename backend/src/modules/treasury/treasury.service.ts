import { prisma } from '../../db/prisma.js';
import { config } from '../../config/index.js';
import { horizonFetch } from '../../common/stellar/rpcClient.js';
import { logger } from '../../common/utils/logger.js';
import { treasuryActualBalanceStroops, treasuryDiscrepancyStroops, treasuryExpectedBalanceStroops, treasuryUnexpectedOutflowsTotal } from './treasury.metrics.js';

type FeeEvent = { data: unknown };
type TreasuryDeps = {
  events: () => Promise<FeeEvent[]>;
  latest: () => Promise<{ actualBalanceStroops: bigint } | null>;
  createSnapshot: (input: { actualBalanceStroops: bigint; expectedBalanceStroops: bigint; discrepancyStroops: bigint; unexpectedOutflowStroops: bigint; status: string }) => Promise<unknown>;
  getBalance: (address: string) => Promise<bigint>;
};

function xlmToStroops(value: string): bigint {
  const [whole, fraction = ''] = value.split('.');
  if (!/^\d+$/.test(whole) || !/^\d*$/.test(fraction)) throw new Error('Invalid Horizon XLM balance');
  return BigInt(whole) * 10_000_000n + BigInt((fraction + '0000000').slice(0, 7));
}

function feeFromEvent(value: unknown): bigint {
  const fields = Array.isArray(value) ? value : null;
  const raw = fields?.[3] ?? (value as { fee?: unknown } | null)?.fee;
  try { return typeof raw === 'string' || typeof raw === 'number' || typeof raw === 'bigint' ? BigInt(raw) : 0n; } catch { return 0n; }
}

export async function getNativeBalanceFromHorizon(address: string): Promise<bigint> {
  const response = await horizonFetch(`/accounts/${encodeURIComponent(address)}`, { headers: { accept: 'application/json' } });
  if (!response.ok) throw new Error(`Horizon treasury account lookup returned ${response.status}`);
  const account = await response.json() as { balances?: Array<{ asset_type?: string; balance?: string }> };
  const native = account.balances?.find((balance) => balance.asset_type === 'native')?.balance;
  if (!native) throw new Error('Horizon response has no native XLM treasury balance');
  return xlmToStroops(native);
}

const productionDeps: TreasuryDeps = {
  events: () => prisma.eventLog.findMany({ where: { topic: 'fee_collected' }, select: { data: true } }),
  latest: () => prisma.treasuryBalanceSnapshot.findFirst({ orderBy: { observedAt: 'desc' }, select: { actualBalanceStroops: true } }),
  createSnapshot: (input) => prisma.treasuryBalanceSnapshot.create({ data: input }),
  getBalance: getNativeBalanceFromHorizon,
};

/** Reconcile fee-event expectations with the actual public treasury balance. */
export async function reconcileTreasury(
  deps: TreasuryDeps = productionDeps,
  settings: { address?: string; openingBalanceStroops?: string } = config.treasury,
): Promise<{ status: string; discrepancyStroops: bigint; unexpectedOutflowStroops: bigint }> {
  if (!settings.address) {
    logger.warn('Treasury monitor skipped: TREASURY_ADDRESS is not configured');
    return { status: 'disabled', discrepancyStroops: 0n, unexpectedOutflowStroops: 0n };
  }
  const [events, prior, actual] = await Promise.all([deps.events(), deps.latest(), deps.getBalance(settings.address)]);
  const expected = BigInt(settings.openingBalanceStroops ?? '0') + events.reduce((total, event) => total + feeFromEvent(event.data), 0n);
  const discrepancy = actual - expected;
  const outflow = prior && actual < prior.actualBalanceStroops ? prior.actualBalanceStroops - actual : 0n;
  const status = outflow > 0n ? 'unexpected_outflow' : discrepancy === 0n ? 'reconciled' : 'mismatch';
  await deps.createSnapshot({ actualBalanceStroops: actual, expectedBalanceStroops: expected, discrepancyStroops: discrepancy, unexpectedOutflowStroops: outflow, status });
  treasuryActualBalanceStroops.set(Number(actual));
  treasuryExpectedBalanceStroops.set(Number(expected));
  treasuryDiscrepancyStroops.set(Number(discrepancy));
  if (outflow > 0n) treasuryUnexpectedOutflowsTotal.inc();
  const context = { status, actualBalanceStroops: actual.toString(), expectedBalanceStroops: expected.toString(), discrepancyStroops: discrepancy.toString(), unexpectedOutflowStroops: outflow.toString() };
  if (status === 'unexpected_outflow') logger.error(context, 'Unexpected treasury outflow detected');
  else if (status === 'mismatch') logger.warn(context, 'Treasury balance does not match indexed fees');
  else logger.info(context, 'Treasury balance reconciled');
  return { status, discrepancyStroops: discrepancy, unexpectedOutflowStroops: outflow };
}
