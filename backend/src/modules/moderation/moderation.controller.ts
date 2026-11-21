import type { Request, Response, NextFunction } from 'express';
import { BadRequestError } from '../../common/errors/AppError.js';
import {
  createModerationAppealSchema,
  createModerationReportSchema,
  reviewModerationAppealSchema,
} from './moderation.schema.js';
import {
  createModerationAppeal,
  createModerationReport,
  listModerationAppeals,
  reviewModerationAppeal,
} from './moderation.service.js';

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

export async function appeal(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const parsed = createModerationAppealSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new BadRequestError('Invalid moderation appeal payload', parsed.error.issues);
    }

    const data = await createModerationAppeal(req.auth!.userId, parsed.data);
    res.status(201).json({ data });
  } catch (error) {
    next(error);
  }
}

export async function listAppeals(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const status = req.query.status;
    if (status !== undefined && status !== 'pending' && status !== 'upheld' && status !== 'overturned') {
      throw new BadRequestError('Invalid moderation appeal status');
    }

    const data = await listModerationAppeals(status);
    res.status(200).json({ data });
  } catch (error) {
    next(error);
  }
}

export async function reviewAppeal(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const parsed = reviewModerationAppealSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new BadRequestError('Invalid moderation appeal review payload', parsed.error.issues);
    }

    const appealId = String((req.params as { appealId: string }).appealId ?? '');
    const data = await reviewModerationAppeal(appealId, req.auth!.userId, parsed.data);
    res.status(200).json({ data });
  } catch (error) {
    next(error);
  }
}
