import { ZodError } from 'zod';
import { AppError } from '../errors/AppError.js';
import { createCounter } from './prometheus.js';

/**
 * Business outcome metrics (issue #1348): tips, volume, withdrawals,
 * registrations and subscription charges, each split by result so a drop in
 * successful operations or a rise in system failures is visible even when the
 * process itself looks healthy.
 *
 * Every `result` label distinguishes failures the platform caused
 * (`system_error`: RPC down, database errors, keeper misconfiguration) from
 * failures the user caused (`user_error`: validation, insufficient balance,
 * revoked authorisation). Alerts in observability/prometheus/alerts.yml key
 * off `system_error` only.
 */
export type OperationResult = 'success' | 'duplicate' | 'user_error' | 'system_error' | 'unparseable' | 'skipped';
export type TipSource = 'api' | 'indexer';
export type RegistrationSource = 'auth' | 'indexer';
export type WithdrawalOperation = 'submit' | 'scheduled_payout';
export type SubscriptionChargeSource = 'job' | 'indexer';
export type FailureClass = Extract<OperationResult, 'user_error' | 'system_error'>;

export const tipsTotal = createCounter({
  name: 'tips_total',
  help: 'Tips recorded off-chain, by source (api = POST /tips, indexer = on-chain event) and result',
  labelNames: ['source', 'result'] as const,
});

export const tipVolumeStroopsTotal = createCounter({
  name: 'tip_volume_stroops_total',
  help: 'Total value of successfully recorded tips in stroops, by source',
  labelNames: ['source'] as const,
});

export const withdrawalsTotal = createCounter({
  name: 'withdrawals_total',
  help: 'Withdrawal operations, by operation (submit = user-signed, scheduled_payout = keeper) and result',
  labelNames: ['operation', 'result'] as const,
});

export const withdrawalVolumeStroopsTotal = createCounter({
  name: 'withdrawal_volume_stroops_total',
  help: 'Total value of successfully submitted withdrawals in stroops, by operation',
  labelNames: ['operation'] as const,
});

export const registrationsTotal = createCounter({
  name: 'registrations_total',
  help: 'New user registrations, by source (auth = first wallet sign-in, indexer = profile_register event) and result',
  labelNames: ['source', 'result'] as const,
});

export const subscriptionChargesTotal = createCounter({
  name: 'subscription_charges_total',
  help: 'Subscription charge attempts, by source (job = keeper charge, indexer = confirmed sub_exec event), result and failure code',
  labelNames: ['source', 'result', 'failure_code'] as const,
});

export const subscriptionChargeVolumeStroopsTotal = createCounter({
  name: 'subscription_charge_volume_stroops_total',
  help: 'Total value of confirmed subscription charges in stroops, by source',
  labelNames: ['source'] as const,
});

/** Charge failure codes the subscription classifier can emit, plus the two worker-level ones. */
export const SUBSCRIPTION_FAILURE_CODES = new Set([
  'AUTHORIZATION_REVOKED',
  'CONTRACT_PAUSED',
  'INVALID_AMOUNT',
  'INSUFFICIENT_BALANCE',
  'SUBSCRIPTION_NOT_FOUND',
  'PROFILE_DEACTIVATED',
  'INVALID_SUBSCRIPTION_PARTIES',
  'RATE_LIMITED',
  'BELOW_MINIMUM',
  'BELOW_CREATOR_MINIMUM',
  'INVALID_SUBSCRIPTION',
  'TOKEN_NOT_ACCEPTED',
  'UNKNOWN_CONTRACT_ERROR',
  'NETWORK_ERROR',
  'TEMPORARY_CHARGE_ERROR',
  'PERSIST_ERROR',
]);

/** Failure codes caused by the subscriber's or creator's own state rather than by the platform. */
const USER_CAUSED_SUBSCRIPTION_FAILURES = new Set([
  'AUTHORIZATION_REVOKED',
  'INVALID_AMOUNT',
  'INSUFFICIENT_BALANCE',
  'SUBSCRIPTION_NOT_FOUND',
  'PROFILE_DEACTIVATED',
  'INVALID_SUBSCRIPTION_PARTIES',
  'BELOW_MINIMUM',
  'BELOW_CREATOR_MINIMUM',
  'INVALID_SUBSCRIPTION',
  'TOKEN_NOT_ACCEPTED',
]);

const FAILURE_CLASS = Symbol.for('tipz.failureClass');

/**
 * Tags an error with an explicit failure class for cases where the HTTP status
 * does not reflect the cause (for example an RPC outage surfaced as a 400).
 */
export function markFailureClass<T extends object>(err: T, failureClass: FailureClass): T {
  Object.defineProperty(err, FAILURE_CLASS, { value: failureClass, enumerable: false });
  return err;
}

/**
 * Splits an error into user-caused vs system-caused. Validation errors and
 * every 4xx `AppError` are the user's; timeouts, aborts, 5xx `AppError`s and
 * anything unexpected are the platform's.
 */
export function classifyFailure(err: unknown): FailureClass {
  const marked = (err as { [FAILURE_CLASS]?: FailureClass } | null)?.[FAILURE_CLASS];
  if (marked) return marked;
  if (err instanceof ZodError) return 'user_error';
  if (err instanceof AppError) return err.statusCode < 500 ? 'user_error' : 'system_error';
  return 'system_error';
}

/** Maps a subscription charge failure code to the user/system split. */
export function classifySubscriptionFailure(code: string): FailureClass {
  return USER_CAUSED_SUBSCRIPTION_FAILURES.has(code) ? 'user_error' : 'system_error';
}

/** Keeps the `failure_code` label bounded to the known classifier codes. */
export function boundedFailureCode(code: string | undefined): string {
  if (code === undefined) return 'none';
  return SUBSCRIPTION_FAILURE_CODES.has(code) ? code : 'UNKNOWN';
}

/** Counter increments are doubles; a single increment above 2^53 stroops (~900M XLM) would lose precision. */
function stroopsToNumber(amount: bigint | string | number): number {
  try {
    const value = typeof amount === 'number' ? amount : Number(BigInt(amount));
    return Number.isFinite(value) && value > 0 ? value : 0;
  } catch {
    return 0;
  }
}

export function observeTip(source: TipSource, result: OperationResult, amountStroops?: bigint | string | number): void {
  tipsTotal.inc({ source, result });
  const volume = result === 'success' && amountStroops !== undefined ? stroopsToNumber(amountStroops) : 0;
  if (volume > 0) tipVolumeStroopsTotal.inc({ source }, volume);
}

export function observeWithdrawal(
  operation: WithdrawalOperation,
  result: OperationResult,
  amountStroops?: bigint | string | number,
): void {
  withdrawalsTotal.inc({ operation, result });
  const volume = result === 'success' && amountStroops !== undefined ? stroopsToNumber(amountStroops) : 0;
  if (volume > 0) withdrawalVolumeStroopsTotal.inc({ operation }, volume);
}

export function observeRegistration(source: RegistrationSource, result: OperationResult): void {
  registrationsTotal.inc({ source, result });
}

export function observeSubscriptionCharge(
  source: SubscriptionChargeSource,
  result: OperationResult,
  options: { failureCode?: string; amountStroops?: bigint | string | number } = {},
): void {
  subscriptionChargesTotal.inc({ source, result, failure_code: boundedFailureCode(options.failureCode) });
  const volume =
    result === 'success' && options.amountStroops !== undefined ? stroopsToNumber(options.amountStroops) : 0;
  if (volume > 0) subscriptionChargeVolumeStroopsTotal.inc({ source }, volume);
}
