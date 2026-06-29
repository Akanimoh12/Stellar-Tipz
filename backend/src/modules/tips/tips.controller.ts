import type { Request, Response, NextFunction } from 'express';
import {
  prepareTipSchema,
  tipIdParamSchema,
  usernameParamSchema,
  tipsListQuerySchema,
  getTipsQuerySchema,
  recordTipSchema,
} from './tips.schema.js';
import * as tipsService from './tips.service.js';

/** GET /tips — filterable, cursor-paginated list of tips. */
export async function getTips(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { limit, cursor, address, direction } = getTipsQuerySchema.parse(req.query);
    const result = await tipsService.getPaginatedTips({ limit, cursor, address, direction });
    res.status(200).json({ data: result.data, nextCursor: result.nextCursor });
  } catch (err) {
    next(err);
  }
}

export async function prepare(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { from, to, amount, message } = prepareTipSchema.parse(req.body);
    const prepared = await tipsService.prepareTip(from, to, amount, message);
    res.status(200).json({ data: prepared });
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

/** POST /tips — record an on-chain tip, idempotent by txHash. */
export async function record(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const input = recordTipSchema.parse(req.body);
    const tip = await tipsService.recordTip(input);
    res.status(200).json({ data: tip });
  } catch (err) {
    next(err);
  }
}
