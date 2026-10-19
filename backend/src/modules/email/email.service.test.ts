import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  env: { EMAIL_WEBHOOK_URL: undefined as string | undefined },
  queueDelivery: vi.fn(),
  transitionDelivery: vi.fn(),
  acknowledgeDeliverySent: vi.fn(),
  auditCreate: vi.fn(),
}));

vi.mock('../../config/env.js', () => ({ env: mocks.env }));
vi.mock('../notifications/delivery.js', () => ({
  queueDelivery: mocks.queueDelivery,
  transitionDelivery: mocks.transitionDelivery,
  acknowledgeDeliverySent: mocks.acknowledgeDeliverySent,
}));
vi.mock('../../db/prisma.js', () => ({
  prisma: { auditLog: { create: mocks.auditCreate } },
}));

import { BadGatewayError, BadRequestError } from '../../common/errors/AppError.js';
import { sendEmailNotification } from './email.service.js';

const input = {
  userId: 'user-1',
  to: 'creator@example.com',
  subject: 'Your tip arrived',
  text: 'A supporter sent you a tip.',
  type: 'tip_received',
  metadata: { tipId: 'tip-1' },
};

beforeEach(() => {
  mocks.env.EMAIL_WEBHOOK_URL = undefined;
  mocks.queueDelivery.mockResolvedValue({ id: 'delivery-1' });
  mocks.transitionDelivery.mockResolvedValue(undefined);
  mocks.acknowledgeDeliverySent.mockResolvedValue(undefined);
  mocks.auditCreate.mockResolvedValue({ id: 'audit-1' });
  vi.stubGlobal('fetch', vi.fn());
});

describe('sendEmailNotification', () => {
  it('queues an auditable delivery when no provider is configured', async () => {
    await expect(sendEmailNotification(input)).resolves.toEqual({
      status: 'queued',
      provider: 'audit-log',
      auditId: 'audit-1',
      deliveryId: 'delivery-1',
    });

    expect(mocks.queueDelivery).toHaveBeenCalledWith('user-1', 'email');
    expect(mocks.acknowledgeDeliverySent).not.toHaveBeenCalled();
    expect(mocks.auditCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        actorId: 'user-1',
        action: 'email.notification.delivery',
        resourceId: 'delivery-1',
      }),
    });
  });

  it('posts to the configured provider and acknowledges the delivery', async () => {
    mocks.env.EMAIL_WEBHOOK_URL = 'https://mailer.example.test/send';
    const fetchMock = vi.mocked(fetch).mockResolvedValue(new Response(null, { status: 202 }));

    await expect(sendEmailNotification(input)).resolves.toMatchObject({
      status: 'sent',
      provider: 'webhook',
    });

    expect(fetchMock).toHaveBeenCalledWith(
      'https://mailer.example.test/send',
      expect.objectContaining({ method: 'POST' }),
    );
    expect(mocks.acknowledgeDeliverySent).toHaveBeenCalledWith('delivery-1');
    expect(mocks.transitionDelivery).not.toHaveBeenCalled();
  });

  it('records a failed delivery and propagates a provider rejection', async () => {
    mocks.env.EMAIL_WEBHOOK_URL = 'https://mailer.example.test/send';
    vi.mocked(fetch).mockResolvedValue(new Response(null, { status: 503 }));

    await expect(sendEmailNotification(input)).rejects.toBeInstanceOf(BadGatewayError);
    expect(mocks.transitionDelivery).toHaveBeenCalledWith(
      'delivery-1',
      'failed',
      'Email provider rejected the delivery request',
    );
    expect(mocks.auditCreate).not.toHaveBeenCalled();
  });

  it('rejects malformed recipients before creating a delivery', async () => {
    await expect(
      sendEmailNotification({ ...input, to: 'not-an-email' }),
    ).rejects.toBeInstanceOf(BadRequestError);
    expect(mocks.queueDelivery).not.toHaveBeenCalled();
  });

  it('marks a network failure with a useful reason', async () => {
    mocks.env.EMAIL_WEBHOOK_URL = 'https://mailer.example.test/send';
    vi.mocked(fetch).mockRejectedValue(new Error('connection refused'));

    await expect(sendEmailNotification(input)).rejects.toThrow('connection refused');
    expect(mocks.transitionDelivery).toHaveBeenCalledWith(
      'delivery-1',
      'failed',
      'connection refused',
    );
  });
});
