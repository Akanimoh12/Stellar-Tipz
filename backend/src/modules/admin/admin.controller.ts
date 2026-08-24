import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { BadRequestError } from '../../common/errors/AppError.js';
import { listUsers, suspendUser } from './admin.service.js';
import {
  listUsersQuerySchema,
  suspendUserParamSchema,
  suspendUserBodySchema,
} from './admin.schema.js';

export async function listUsersController(req: Request, res: Response, next: NextFunction) {
  try {
    const query = listUsersQuerySchema.parse(req.query);
    const result = await listUsers(query);
    res.json({ data: result });
  } catch (error) {
    if (error instanceof z.ZodError) {
      next(new BadRequestError('Invalid query parameters', error.issues));
    } else {
      next(error);
    }
  }
}

export async function suspendUserController(req: Request, res: Response, next: NextFunction) {
  try {
    const { id } = suspendUserParamSchema.parse(req.params);
    const body = suspendUserBodySchema.parse(req.body);
    await suspendUser(id, body.reason);
    res.status(204).send();
  } catch (error) {
    if (error instanceof z.ZodError) {
      next(new BadRequestError('Invalid request', error.issues));
    } else {
      next(error);
    }
  }
}
