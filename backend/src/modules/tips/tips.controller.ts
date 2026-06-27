import type { Request, Response, NextFunction } from 'express';
import { prepareTipSchema } from './tips.schema.js';
import * as tipsService from './tips.service.js';

export async function prepare(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { from, to, amount, message } = prepareTipSchema.parse(req.body);
    const prepared = await tipsService.prepareTip(from, to, amount, message);
    res.status(200).json({ data: prepared });
  } catch (err) {
    next(err);
  }
}
