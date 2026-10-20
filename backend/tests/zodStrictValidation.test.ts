import { describe, it, expect } from 'vitest';
import type { z } from 'zod';

import { createAuditLogSchema } from '../src/modules/admin/admin.schema.js';
import {
  prepareSetFeeSchema,
  prepareSetMinTipAmountSchema,
  prepareSetMinWithdrawalAmountSchema,
  preparePauseSchema,
  submitSetFeeSchema,
  submitSetMinTipAmountSchema,
  submitSetMinWithdrawalAmountSchema,
  submitPauseSchema,
} from '../src/modules/admin/config.schema.js';
import { createApiKeySchema, rotateApiKeySchema } from '../src/modules/apiKeys/apiKeys.schema.js';
import { challengeSchema, verifySchema, refreshSchema } from '../src/modules/auth/auth.schema.js';
import { recalculateSchema } from '../src/modules/credit/credit.schema.js';
import { sendEmailSchema } from '../src/modules/email/email.schema.js';
import { createGoalSchema, updateGoalSchema } from '../src/modules/goals/goals.schema.js';
import { createModerationReportSchema } from '../src/modules/moderation/moderation.schema.js';
import { updateNotificationPreferencesSchema } from '../src/modules/notifications/notifications.schema.js';
import { updateProfileSchema, uploadProfileImageSchema } from '../src/modules/profiles/profiles.schema.js';
import {
  requestRefundSchema,
  rejectRefundSchema,
  submitRefundResolutionSchema,
} from '../src/modules/refunds/refunds.schema.js';
import {
  prepareCreateSubscriptionSchema,
  submitCreateSubscriptionSchema,
  prepareCancelSubscriptionSchema,
  submitCancelSubscriptionSchema,
} from '../src/modules/subscriptions/subscriptions.schema.js';
import {
  submitTipSchema,
  prepareTipSchema,
  recordTipSchema,
} from '../src/modules/tips/tips.schema.js';
import { createWebhookSubscriptionSchema } from '../src/modules/webhooks/webhooks.schema.js';
import { payoutScheduleSchema } from '../src/modules/withdrawals/payouts.schema.js';
import {
  prepareWithdrawalSchema,
  submitWithdrawalSchema,
} from '../src/modules/withdrawals/withdrawals.schema.js';
import { xHandleSchema, fetchMetricsSchema } from '../src/modules/x/x.schema.js';
import { cidParamSchema } from '../src/modules/ipfs/ipfs.schema.js';

const STELLAR_ADDRESS = `G${'A'.repeat(55)}`;

/**
 * Every request-body schema used to parse a mutating endpoint's `req.body`
 * (or, for IPFS, `req.params`), paired with a minimal payload that is valid
 * against the schema *before* an `extra` field is appended (issue #1233).
 */
const strictSchemas: Array<{
  name: string;
  schema: z.ZodTypeAny;
  validPayload: Record<string, unknown>;
}> = [
  { name: 'admin.createAuditLogSchema', schema: createAuditLogSchema, validPayload: { action: 'test.action' } },
  { name: 'config.prepareSetFeeSchema', schema: prepareSetFeeSchema, validPayload: { feeBps: 100 } },
  { name: 'config.prepareSetMinTipAmountSchema', schema: prepareSetMinTipAmountSchema, validPayload: { amount: '100' } },
  { name: 'config.prepareSetMinWithdrawalAmountSchema', schema: prepareSetMinWithdrawalAmountSchema, validPayload: { amount: '100' } },
  { name: 'config.preparePauseSchema', schema: preparePauseSchema, validPayload: { paused: true } },
  { name: 'config.submitSetFeeSchema', schema: submitSetFeeSchema, validPayload: { feeBps: 100, signedTxXdr: 'xdr' } },
  { name: 'config.submitSetMinTipAmountSchema', schema: submitSetMinTipAmountSchema, validPayload: { amount: '100', signedTxXdr: 'xdr' } },
  { name: 'config.submitSetMinWithdrawalAmountSchema', schema: submitSetMinWithdrawalAmountSchema, validPayload: { amount: '100', signedTxXdr: 'xdr' } },
  { name: 'config.submitPauseSchema', schema: submitPauseSchema, validPayload: { paused: true, signedTxXdr: 'xdr' } },
  { name: 'apiKeys.createApiKeySchema', schema: createApiKeySchema, validPayload: { scopes: ['read'] } },
  { name: 'apiKeys.rotateApiKeySchema', schema: rotateApiKeySchema, validPayload: { gracePeriodMinutes: 60 } },
  { name: 'auth.challengeSchema', schema: challengeSchema, validPayload: { stellarAddress: STELLAR_ADDRESS } },
  { name: 'auth.verifySchema', schema: verifySchema, validPayload: { stellarAddress: STELLAR_ADDRESS, signature: 'sig', challenge: 'chal' } },
  { name: 'auth.refreshSchema', schema: refreshSchema, validPayload: { refreshToken: 'token' } },
  { name: 'credit.recalculateSchema', schema: recalculateSchema, validPayload: { userId: 'user-1' } },
  { name: 'email.sendEmailSchema', schema: sendEmailSchema, validPayload: { to: 'a@example.com', subject: 'Hi', text: 'Body' } },
  { name: 'goals.createGoalSchema', schema: createGoalSchema, validPayload: { title: 'Goal', targetStroops: '1000' } },
  { name: 'goals.updateGoalSchema', schema: updateGoalSchema, validPayload: { title: 'Goal' } },
  { name: 'ipfs.cidParamSchema', schema: cidParamSchema, validPayload: { cid: 'QmXoypizjW3WknFiJnKLwHCnL72vedxjQkDDP1mXWo6uco' } },
  { name: 'moderation.createModerationReportSchema', schema: createModerationReportSchema, validPayload: { targetType: 'profile', targetId: 'p1', reason: 'spam' } },
  { name: 'notifications.updateNotificationPreferencesSchema', schema: updateNotificationPreferencesSchema, validPayload: { tipReceived: true } },
  { name: 'profiles.updateProfileSchema', schema: updateProfileSchema, validPayload: { displayName: 'Name' } },
  { name: 'profiles.uploadProfileImageSchema', schema: uploadProfileImageSchema, validPayload: { dataUrl: 'data:image/png;base64,AAAA' } },
  { name: 'refunds.requestRefundSchema', schema: requestRefundSchema, validPayload: { tipTxHash: 'hash', reason: 'reason' } },
  { name: 'refunds.rejectRefundSchema', schema: rejectRefundSchema, validPayload: { reason: 'reason' } },
  { name: 'refunds.submitRefundResolutionSchema', schema: submitRefundResolutionSchema, validPayload: { signedTxXdr: 'xdr' } },
  { name: 'subscriptions.prepareCreateSubscriptionSchema', schema: prepareCreateSubscriptionSchema, validPayload: { creatorStellarAddress: STELLAR_ADDRESS, amountStroops: '100', interval: 'DAILY' } },
  { name: 'subscriptions.submitCreateSubscriptionSchema', schema: submitCreateSubscriptionSchema, validPayload: { creatorStellarAddress: STELLAR_ADDRESS, amountStroops: '100', interval: 'DAILY', signedTxXdr: 'xdr' } },
  { name: 'subscriptions.prepareCancelSubscriptionSchema', schema: prepareCancelSubscriptionSchema, validPayload: { creatorStellarAddress: STELLAR_ADDRESS } },
  { name: 'subscriptions.submitCancelSubscriptionSchema', schema: submitCancelSubscriptionSchema, validPayload: { creatorStellarAddress: STELLAR_ADDRESS, signedTxXdr: 'xdr' } },
  { name: 'tips.submitTipSchema', schema: submitTipSchema, validPayload: { signedTxXdr: 'xdr' } },
  { name: 'tips.prepareTipSchema', schema: prepareTipSchema, validPayload: { from: STELLAR_ADDRESS, to: STELLAR_ADDRESS, amount: '100' } },
  { name: 'tips.recordTipSchema', schema: recordTipSchema, validPayload: { txHash: 'hash', ledger: 1, fromAddress: STELLAR_ADDRESS, toAddress: STELLAR_ADDRESS, amountStroops: '100' } },
  { name: 'webhooks.createWebhookSubscriptionSchema', schema: createWebhookSubscriptionSchema, validPayload: { url: 'https://example.com/hook', events: ['tip.received'] } },
  { name: 'payouts.payoutScheduleSchema', schema: payoutScheduleSchema, validPayload: { enabled: true } },
  { name: 'withdrawals.prepareWithdrawalSchema', schema: prepareWithdrawalSchema, validPayload: { amount: '100' } },
  { name: 'withdrawals.submitWithdrawalSchema', schema: submitWithdrawalSchema, validPayload: { amount: '100', signedTxXdr: 'xdr' } },
  { name: 'x.xHandleSchema', schema: xHandleSchema, validPayload: { handle: 'jack' } },
  { name: 'x.fetchMetricsSchema', schema: fetchMetricsSchema, validPayload: { handle: 'jack' } },
];

describe('Zod strict-mode validation on request schemas (issue #1233)', () => {
  it('has at least one schema under test', () => {
    expect(strictSchemas.length).toBeGreaterThan(0);
  });

  for (const { name, schema, validPayload } of strictSchemas) {
    describe(name, () => {
      it('accepts the known, valid fields', () => {
        expect(() => schema.parse(validPayload)).not.toThrow();
      });

      it('rejects an unrecognized field with a message naming it', () => {
        const withExtra = { ...validPayload, notAFieldOnThisSchema: 'surprise' };
        const result = schema.safeParse(withExtra);
        expect(result.success).toBe(false);
        if (!result.success) {
          const message = JSON.stringify(result.error.issues);
          expect(message).toContain('notAFieldOnThisSchema');
        }
      });
    });
  }
});
