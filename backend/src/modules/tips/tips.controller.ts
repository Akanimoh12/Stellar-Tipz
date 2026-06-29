import { z } from 'zod';
import type { Request, Response, NextFunction } from 'express';
import {
  prepareTipSchema,
  submitTipSchema,
  tipIdParamSchema,
  usernameParamSchema,
  tipsListQuerySchema,
} from './tips.schema.js';
import * as tipsService from './tips.service.js';

export async function prepare(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { from, to, amount, message } = prepareTipSchema.parse(req.body);
    const sanitizedMessage = tipsService.sanitizeTipMessage(message);
    const prepared = await tipsService.prepareTip(from, to, amount, sanitizedMessage);
    res.status(200).json({ data: prepared });
  } catch (err) {
    next(err);
  }
}

export async function submit(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { signedTxXdr } = submitTipSchema.parse(req.body);
    const result = await tipsService.submitTip(signedTxXdr);
    res.status(200).json({ data: result });
  } catch (err) {
    next(err);
  }
}

export async function getTips(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { limit, cursor, address, direction, tokenCode, startDate, endDate } = tipsListQuerySchema
      .extend({
        address: z.string().regex(/^G[A-Z2-7]{55}$/, 'Invalid Stellar address').optional(),
        direction: z.enum(['sent', 'received']).optional(),
      })
      .parse(req.query);
    const result = await tipsService.getPaginatedTips({
      limit, cursor, address, direction, tokenCode, startDate, endDate,
    });
    res.status(200).json({ data: result.data, nextCursor: result.nextCursor });
  } catch (err) {
    next(err);
  }
}

export async function getById(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { id } = tipIdParamSchema.parse(req.params);
    const tip = await tipsService.getTipById(id);
    res.status(200).json({ data: tip });
  } catch (err) {
    next(err);
  }
}

export async function getReceived(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { username } = usernameParamSchema.parse(req.params);
    const { limit, cursor } = tipsListQuerySchema.parse(req.query);
    const result = await tipsService.getTipsReceivedByUsername(username, limit, cursor);
    res.status(200).json({ data: result.data, nextCursor: result.nextCursor });
  } catch (err) {
    next(err);
  }
}

export async function getSent(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { limit, cursor } = tipsListQuerySchema.parse(req.query);
    const result = await tipsService.getTipsSentByAddress(req.user!.stellarAddress, limit, cursor);
    res.status(200).json({ data: result.data, nextCursor: result.nextCursor });
  } catch (err) {
    next(err);
  }
}
