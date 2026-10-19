import { beforeEach, describe, expect, it } from 'vitest';
import { ZodError } from 'zod';
import {
  BadRequestError,
  ConflictError,
  ServiceUnavailableError,
  UnauthorizedError,
} from '../errors/AppError.js';
import {
  SUBSCRIPTION_FAILURE_CODES,
  boundedFailureCode,
  classifyFailure,
  classifySubscriptionFailure,
  markFailureClass,
  observeRegistration,
  observeSubscriptionCharge,
  observeTip,
  observeWithdrawal,
} from './businessMetrics.js';
import { registry } from './prometheus.js';

type Series = { labels: Record<string, string>; value: number };

async function series(name: string): Promise<Series[]> {
  const metric = (await registry.getMetricsAsJSON()).find((m) => m.name === name);
  return (metric?.values ?? []) as Series[];
}

describe('business metrics (issue #1348)', () => {
  beforeEach(() => {
    registry.resetMetrics();
  });

  describe('classifyFailure', () => {
    it('treats validation and 4xx application errors as user-caused', () => {
      expect(classifyFailure(new ZodError([]))).toBe('user_error');
      expect(classifyFailure(new BadRequestError('Insufficient balance'))).toBe('user_error');
      expect(classifyFailure(new UnauthorizedError())).toBe('user_error');
      expect(classifyFailure(new ConflictError())).toBe('user_error');
    });

    it('treats 5xx application errors and unexpected errors as system-caused', () => {
      expect(classifyFailure(new ServiceUnavailableError())).toBe('system_error');
      expect(classifyFailure(new Error('ECONNRESET'))).toBe('system_error');
      expect(classifyFailure(new DOMException('timed out', 'TimeoutError'))).toBe('system_error');
      expect(classifyFailure(null)).toBe('system_error');
    });

    it('honours an explicit failure-class marker over the status code', () => {
      const err = markFailureClass(new BadRequestError('Failed to submit withdrawal transaction'), 'system_error');
      expect(classifyFailure(err)).toBe('system_error');
      expect(err).toBeInstanceOf(BadRequestError);
      expect(Object.keys(err)).not.toContain('failureClass');
      expect(JSON.stringify(err)).not.toContain('system_error');
    });
  });

  describe('subscription charge failures', () => {
    it('splits classifier codes into user and system causes', () => {
      expect(classifySubscriptionFailure('INSUFFICIENT_BALANCE')).toBe('user_error');
      expect(classifySubscriptionFailure('AUTHORIZATION_REVOKED')).toBe('user_error');
      expect(classifySubscriptionFailure('NETWORK_ERROR')).toBe('system_error');
      expect(classifySubscriptionFailure('CONTRACT_PAUSED')).toBe('system_error');
      expect(classifySubscriptionFailure('SOMETHING_NEW')).toBe('system_error');
    });

    it('bounds the failure_code label to known codes', () => {
      expect(boundedFailureCode(undefined)).toBe('none');
      expect(boundedFailureCode('RATE_LIMITED')).toBe('RATE_LIMITED');
      expect(boundedFailureCode('user-supplied-garbage')).toBe('UNKNOWN');
      expect(SUBSCRIPTION_FAILURE_CODES.has('PERSIST_ERROR')).toBe(true);
    });
  });

  it('counts tips and adds volume only for successes', async () => {
    observeTip('api', 'success', 5_000_000n);
    observeTip('api', 'success', '2500000');
    observeTip('api', 'duplicate', 9_999_999n);
    observeTip('indexer', 'system_error');
    observeTip('indexer', 'unparseable');

    const tips = await series('tipz_tips_total');
    expect(tips).toContainEqual({ labels: { source: 'api', result: 'success' }, value: 2 });
    expect(tips).toContainEqual({ labels: { source: 'api', result: 'duplicate' }, value: 1 });
    expect(tips).toContainEqual({ labels: { source: 'indexer', result: 'system_error' }, value: 1 });
    expect(tips).toContainEqual({ labels: { source: 'indexer', result: 'unparseable' }, value: 1 });

    const volume = await series('tipz_tip_volume_stroops_total');
    expect(volume).toEqual([{ labels: { source: 'api' }, value: 7_500_000 }]);
  });

  it('ignores non-positive or malformed amounts instead of throwing', async () => {
    observeTip('api', 'success', -5n);
    observeTip('api', 'success', 'not-a-number' as unknown as string);
    expect(await series('tipz_tip_volume_stroops_total')).toEqual([]);
    expect((await series('tipz_tips_total'))[0].value).toBe(2);
  });

  it('counts withdrawals per operation with volume for successes', async () => {
    observeWithdrawal('submit', 'success', 30_000_000n);
    observeWithdrawal('submit', 'user_error');
    observeWithdrawal('scheduled_payout', 'success', '10000000');
    observeWithdrawal('scheduled_payout', 'skipped');
    observeWithdrawal('scheduled_payout', 'system_error');

    expect(await series('tipz_withdrawals_total')).toEqual(
      expect.arrayContaining([
        { labels: { operation: 'submit', result: 'success' }, value: 1 },
        { labels: { operation: 'submit', result: 'user_error' }, value: 1 },
        { labels: { operation: 'scheduled_payout', result: 'skipped' }, value: 1 },
        { labels: { operation: 'scheduled_payout', result: 'system_error' }, value: 1 },
      ]),
    );
    expect(await series('tipz_withdrawal_volume_stroops_total')).toEqual(
      expect.arrayContaining([
        { labels: { operation: 'submit' }, value: 30_000_000 },
        { labels: { operation: 'scheduled_payout' }, value: 10_000_000 },
      ]),
    );
  });

  it('counts registrations by source', async () => {
    observeRegistration('auth', 'success');
    observeRegistration('indexer', 'success');
    observeRegistration('indexer', 'unparseable');
    expect(await series('tipz_registrations_total')).toEqual(
      expect.arrayContaining([
        { labels: { source: 'auth', result: 'success' }, value: 1 },
        { labels: { source: 'indexer', result: 'success' }, value: 1 },
        { labels: { source: 'indexer', result: 'unparseable' }, value: 1 },
      ]),
    );
  });

  it('counts subscription charges with a bounded failure code and confirmed volume', async () => {
    observeSubscriptionCharge('job', 'success');
    observeSubscriptionCharge('job', 'user_error', { failureCode: 'INSUFFICIENT_BALANCE' });
    observeSubscriptionCharge('job', 'system_error', { failureCode: 'weird' });
    observeSubscriptionCharge('indexer', 'success', { amountStroops: 1_000_000n });

    expect(await series('tipz_subscription_charges_total')).toEqual(
      expect.arrayContaining([
        { labels: { source: 'job', result: 'success', failure_code: 'none' }, value: 1 },
        { labels: { source: 'job', result: 'user_error', failure_code: 'INSUFFICIENT_BALANCE' }, value: 1 },
        { labels: { source: 'job', result: 'system_error', failure_code: 'UNKNOWN' }, value: 1 },
        { labels: { source: 'indexer', result: 'success', failure_code: 'none' }, value: 1 },
      ]),
    );
    expect(await series('tipz_subscription_charge_volume_stroops_total')).toEqual([
      { labels: { source: 'indexer' }, value: 1_000_000 },
    ]);
  });
});
