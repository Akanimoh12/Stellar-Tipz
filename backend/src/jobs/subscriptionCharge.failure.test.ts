import { describe, expect, it } from 'vitest';
import {
  classifySubscriptionChargeFailure,
  extractContractErrorCode,
} from './subscriptionCharge.failure.js';

describe('subscription charge failure classification', () => {
  it.each([
    [14, 'INSUFFICIENT_BALANCE'],
    [7, 'CONTRACT_PAUSED'],
    [27, 'RATE_LIMITED'],
  ])('classifies contract code %i as retryable', (contractCode, code) => {
    expect(
      classifySubscriptionChargeFailure(new Error(`Error(Contract, #${contractCode})`)),
    ).toMatchObject({ code, contractCode, retryable: true });
  });

  it.each([
    [17, 'SUBSCRIPTION_NOT_FOUND'],
    [3, 'AUTHORIZATION_REVOKED'],
    [13, 'INVALID_AMOUNT'],
    [18, 'PROFILE_DEACTIVATED'],
  ])('classifies contract code %i as permanent', (contractCode, code) => {
    expect(
      classifySubscriptionChargeFailure(new Error(`Error(Contract, #${contractCode})`)),
    ).toMatchObject({ code, contractCode, retryable: false });
  });

  it('prefers a structured contract code over wording', () => {
    const error = { type: 'contract', code: 17, message: 'temporary network timeout' };
    expect(classifySubscriptionChargeFailure(error)).toMatchObject({
      code: 'SUBSCRIPTION_NOT_FOUND',
      retryable: false,
    });
  });

  it('isolates Soroban contract-code parsing', () => {
    expect(extractContractErrorCode({ cause: new Error('HostError: Error(Contract, #14)') })).toBe(
      14,
    );
  });

  it('classifies an unknown RPC failure as bounded retryable with a safe reason', () => {
    expect(
      classifySubscriptionChargeFailure({ code: 'ECONNRESET', message: 'socket closed' }),
    ).toEqual({
      code: 'NETWORK_ERROR',
      reason: 'A temporary network error prevented the subscription charge.',
      retryable: true,
      contractCode: null,
    });
  });

  it('classifies a charge confirmation timeout as retryable infrastructure failure', () => {
    expect(
      classifySubscriptionChargeFailure(
        new Error('Subscription charge confirmation timed out'),
      ),
    ).toMatchObject({ code: 'NETWORK_ERROR', retryable: true });
  });

  it('defaults unknown failures to the bounded retryable path', () => {
    expect(
      classifySubscriptionChargeFailure(new Error('unexpected provider response')),
    ).toMatchObject({ code: 'TEMPORARY_CHARGE_ERROR', retryable: true });
  });
});
