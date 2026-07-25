import type { Request, Response, NextFunction } from 'express';
import { handleParamSchema } from './x.schema.js';
import * as xService from './x.service.js';

export async function getMetrics(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { handle } = handleParamSchema.parse(req.params);
    const result = await xService.getCachedXMetrics(handle);
    res.status(200).json({ data: result });
  } catch (err) {
    next(err);
  }
}
