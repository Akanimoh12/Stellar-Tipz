import type { Request, Response, NextFunction } from 'express';
import { BadRequestError } from '../../common/errors/AppError.js';
import { createModerationReportSchema } from './moderation.schema.js';
import { createModerationReport } from './moderation.service.js';

export async function report(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const parsed = createModerationReportSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new BadRequestError('Invalid moderation report payload', parsed.error.issues);
    }

    const data = await createModerationReport(req.auth!.userId, parsed.data);
    res.status(201).json({ data });
  } catch (error) {
    next(error);
  }
}
