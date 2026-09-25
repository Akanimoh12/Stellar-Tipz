import { env } from '../../config/env.js';
import { queueDelivery, transitionDelivery, acknowledgeDeliverySent } from '../notifications/delivery.js';
import type { Prisma } from '@prisma/client';
import { prisma } from '../../db/prisma.js';
import { BadGatewayError, BadRequestError } from '../../common/errors/AppError.js';
import { logger } from '../../common/utils/logger.js';

export type EmailNotificationInput = {
  userId: string;
  to: string;
  subject: string;
  text: string;
  html?: string;
  type?: string;
  metadata?: Record<string, unknown>;
};

export type EmailDeliveryResult = {
  status: 'sent' | 'queued';
  provider: 'webhook' | 'audit-log';
  auditId: string;
  deliveryId: string;
};

const EMAIL_WEBHOOK_URL = env.EMAIL_WEBHOOK_URL;

function assertValidRecipient(to: string): void {
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) {
    throw new BadRequestError('A valid email recipient is required');
  }
}

async function postToEmailWebhook(input: EmailNotificationInput): Promise<void> {
  if (!EMAIL_WEBHOOK_URL) {
    return;
  }

  const response = await fetch(EMAIL_WEBHOOK_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      to: input.to,
      subject: input.subject,
      text: input.text,
      html: input.html,
      type: input.type ?? 'notification',
      metadata: input.metadata ?? {},
    }),
  });

  if (!response.ok) {
    throw new BadGatewayError('Email provider rejected the delivery request', {
      status: response.status,
    });
  }
}

export async function sendEmailNotification(
  input: EmailNotificationInput,
): Promise<EmailDeliveryResult> {
  assertValidRecipient(input.to);

  const provider = EMAIL_WEBHOOK_URL ? 'webhook' : 'audit-log';
  const status = EMAIL_WEBHOOK_URL ? 'sent' : 'queued';

  const delivery = await queueDelivery(input.userId, 'email');
  if (EMAIL_WEBHOOK_URL) {
    try {
      await postToEmailWebhook({ ...input, metadata: { ...input.metadata, deliveryId: delivery.id } });
      await acknowledgeDeliverySent(delivery.id);
    } catch (err) {
      await transitionDelivery(delivery.id, 'failed', err instanceof Error ? err.message : 'Provider request failed');
      throw err;
    }
  } else {
    logger.info(
      { userId: input.userId, type: input.type, to: input.to },
      'EMAIL_WEBHOOK_URL is not configured; recording email notification for async delivery',
    );
  }

  const audit = await prisma.auditLog.create({
    data: {
      actorId: input.userId,
      actorType: 'user',
      outcome: 'success',
      action: 'email.notification.delivery',
      resourceId: delivery.id,
      resourceType: 'notification_delivery',
      input: {
        provider,
        status,
        type: input.type ?? 'notification',
        subject: input.subject,
        metadata: input.metadata ?? {},
      } as Prisma.InputJsonValue,
    },
  });

  return { status, provider, auditId: audit.id, deliveryId: delivery.id };
}
