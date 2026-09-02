import type { Request, Response, NextFunction } from 'express';
import {
  refundHistoryQuerySchema,
  refundIdParamSchema,
  rejectRefundSchema,
  requestRefundSchema,
  submitRefundResolutionSchema,
} from './refunds.schema.js';
import * as refundsService from './refunds.service.js';

/** POST /refunds/request: request a refund for a tip sent by the authenticated user. */
export async function requestRefund(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { tipTxHash, reason } = requestRefundSchema.parse(req.body);
    const result = await refundsService.requestRefund(req.user!.id, tipTxHash, reason);
    res.status(201).json({ data: result });
  } catch (err) {
    next(err);
  }
}

/** GET /refunds/me: refund history for the authenticated user. */
export async function getMyRefunds(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { limit, cursor, offset } = refundHistoryQuerySchema.parse(req.query);
    const result = await refundsService.getMyRefunds(req.user!.id, limit, cursor, offset);
    res.status(200).json(result);
  } catch (err) {
    next(err);
  }
}

/** GET /refunds/received: refund requests for tips received by the authenticated creator. */
export async function getReceivedRefunds(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { limit, offset } = refundHistoryQuerySchema.parse(req.query);
    const result = await refundsService.getReceivedRefunds(req.user!.id, limit, offset);
    res.status(200).json({ data: result });
  } catch (err) {
    next(err);
  }
}

/** POST /refunds/:id/approve: prepare an unsigned approve_refund transaction. */
export async function approveRefund(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { id } = refundIdParamSchema.parse(req.params);
    const result = await refundsService.prepareApproveRefund(req.user!.id, id);
    res.status(200).json({ data: result });
  } catch (err) {
    next(err);
  }
}

/** POST /refunds/:id/reject: prepare an unsigned reject_refund transaction. */
export async function rejectRefund(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { id } = refundIdParamSchema.parse(req.params);
    rejectRefundSchema.parse(req.body);
    const result = await refundsService.prepareRejectRefund(req.user!.id, id);
    res.status(200).json({ data: result });
  } catch (err) {
    next(err);
  }
}

/** POST /refunds/:id/approve/submit: submit a signed approve_refund transaction. */
export async function submitApproveRefund(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { id } = refundIdParamSchema.parse(req.params);
    const { signedTxXdr } = submitRefundResolutionSchema.parse(req.body);
    const result = await refundsService.submitApproveRefund(req.user!.id, id, signedTxXdr);
    res.status(200).json({ data: result });
  } catch (err) {
    next(err);
  }
}

/** POST /refunds/:id/reject/submit: submit a signed reject_refund transaction. */
export async function submitRejectRefund(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { id } = refundIdParamSchema.parse(req.params);
    const { signedTxXdr, reason } = submitRefundResolutionSchema.parse(req.body);
    const rejection = rejectRefundSchema.parse({ reason });
    const result = await refundsService.submitRejectRefund(
      req.user!.id,
      id,
      signedTxXdr,
      rejection.reason,
    );
    res.status(200).json({ data: result });
  } catch (err) {
    next(err);
  }
}
