import type { Request, Response, NextFunction } from 'express';
import { deleteAccount, exportUserData } from './privacy.service.js';

export async function exportData(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const data = await exportUserData(req.auth!.userId);
    res
      .status(200)
      .setHeader('content-disposition', 'attachment; filename="stellar-tipz-export.json"')
      .json({ data });
  } catch (error) {
    next(error);
  }
}

export async function removeAccount(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const data = await deleteAccount(req.auth!.userId);
    res.status(202).json({ data });
  } catch (error) {
    next(error);
  }
}
