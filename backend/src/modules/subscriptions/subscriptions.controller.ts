import type { Request, Response, NextFunction } from 'express';
import {
  listSubscriptionsQuerySchema,
  prepareCreateSubscriptionSchema,
  submitCreateSubscriptionSchema,
  prepareCancelSubscriptionSchema,
  submitCancelSubscriptionSchema,
} from './subscriptions.schema.js';
import * as subscriptionsService from './subscriptions.service.js';

/** GET /subscriptions/me: subscriptions where the caller is the tipper or the creator. */
export async function getMySubscriptions(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { role, status, limit, offset } = listSubscriptionsQuerySchema.parse(req.query);
    const result = await subscriptionsService.listMySubscriptions(
      req.user!.id,
      role,
      status,
      limit,
      offset,
    );
    res.status(200).json({ data: result });
  } catch (err) {
    next(err);
  }
}

/** POST /subscriptions/prepare: build an unsigned create_subscription transaction. */
export async function prepareCreateSubscription(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { creatorStellarAddress, amountStroops, interval } = prepareCreateSubscriptionSchema.parse(
      req.body,
    );
    const result = await subscriptionsService.prepareCreateSubscription(
      req.user!.id,
      creatorStellarAddress,
      amountStroops,
      interval,
    );
    res.status(200).json({ data: result });
  } catch (err) {
    next(err);
  }
}

/** POST /subscriptions/submit: broadcast a wallet-signed create_subscription transaction. */
export async function submitCreateSubscription(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { creatorStellarAddress, amountStroops, interval, signedTxXdr } =
      submitCreateSubscriptionSchema.parse(req.body);
    const result = await subscriptionsService.submitCreateSubscription(
      req.user!.id,
      creatorStellarAddress,
      amountStroops,
      interval,
      signedTxXdr,
    );
    res.status(200).json({ data: result });
  } catch (err) {
    next(err);
  }
}

/** POST /subscriptions/prepare-cancel: build an unsigned cancel_subscription transaction. */
export async function prepareCancelSubscription(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { creatorStellarAddress } = prepareCancelSubscriptionSchema.parse(req.body);
    const result = await subscriptionsService.prepareCancelSubscription(
      req.user!.id,
      creatorStellarAddress,
    );
    res.status(200).json({ data: result });
  } catch (err) {
    next(err);
  }
}

/** POST /subscriptions/submit-cancel: broadcast a wallet-signed cancel_subscription transaction. */
export async function submitCancelSubscription(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { creatorStellarAddress, signedTxXdr } = submitCancelSubscriptionSchema.parse(req.body);
    const result = await subscriptionsService.submitCancelSubscription(
      req.user!.id,
      creatorStellarAddress,
      signedTxXdr,
    );
    res.status(200).json({ data: result });
  } catch (err) {
    next(err);
  }
}
