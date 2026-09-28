import { timingSafeEqual } from 'node:crypto';
import { Router } from 'express';
import { z } from 'zod';
import { env } from '../../config/env.js';
import { UnauthorizedError } from '../../common/errors/AppError.js';
import { transitionDelivery } from './delivery.js';

const receiptSchema = z
  .object({
    deliveryId: z.string().min(1).max(200),
    status: z.enum(['sent', 'delivered', 'failed', 'bounced']),
    reason: z.string().trim().min(1).max(1000).optional(),
  })
  .strict();

export const deliveryRouter = Router();
deliveryRouter.post('/receipt', async (req, res, next) => {
  try {
    const expected = Buffer.from(env.NOTIFICATION_RECEIPT_SECRET ?? '');
    const actual = Buffer.from(req.get('x-notification-secret') ?? '');
    if (
      !expected.length ||
      expected.length !== actual.length ||
      !timingSafeEqual(expected, actual)
    ) {
      throw new UnauthorizedError('Invalid delivery receipt credentials');
    }
    const { deliveryId, status, reason } = receiptSchema.parse(req.body);
    await transitionDelivery(deliveryId, status, reason);
    res.sendStatus(204);
  } catch (err) {
    next(err);
  }
});
