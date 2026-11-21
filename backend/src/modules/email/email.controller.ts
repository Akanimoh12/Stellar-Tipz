import type { Request, Response, NextFunction } from 'express';
import { BadRequestError } from '../../common/errors/AppError.js';
import { sendEmailSchema } from './email.schema.js';
import { sendEmailNotification } from './email.service.js';

export async function send(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const parsed = sendEmailSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new BadRequestError('Invalid email notification payload', parsed.error.issues);
    }

    const result = await sendEmailNotification({
      userId: req.auth!.userId,
      ...parsed.data,
    });

    res.status(202).json({ data: result });
  } catch (error) {
    next(error);
  }
}
