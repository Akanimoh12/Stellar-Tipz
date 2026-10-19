import type { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { BadRequestError } from '../../common/errors/AppError.js';
import type { AuthPayload } from '../auth/auth.types.js';
import * as goalsService from './goals.service.js';
import {
  createGoalSchema,
  updateGoalSchema,
  goalIdSchema,
  goalListQuerySchema,
} from './goals.schema.js';

export async function createGoalController(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const auth = req.auth as AuthPayload;
    const data = createGoalSchema.parse(req.body);
    const goal = await goalsService.createGoal(auth.userId, data);
    res.status(201).json({ data: goal });
  } catch (error) {
    if (error instanceof z.ZodError) {
      next(new BadRequestError('Invalid goal data', error.issues));
    } else {
      next(error);
    }
  }
}

export async function getGoalController(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { id } = goalIdSchema.parse(req.params);
    const goal = await goalsService.getGoalById(id);
    res.json({ data: goal });
  } catch (error) {
    if (error instanceof z.ZodError) {
      next(new BadRequestError('Invalid goal ID', error.issues));
    } else {
      next(error);
    }
  }
}

export async function listGoalsController(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { limit, offset, status } = goalListQuerySchema.parse(req.query);
    const result = await goalsService.listGoals(limit, offset, status);
    res.json(result);
  } catch (error) {
    if (error instanceof z.ZodError) {
      next(new BadRequestError('Invalid query parameters', error.issues));
    } else {
      next(error);
    }
  }
}

export async function updateGoalController(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const auth = req.auth as AuthPayload;
    const { id } = goalIdSchema.parse(req.params);
    const data = updateGoalSchema.parse(req.body);
    const goal = await goalsService.updateGoal(id, auth.userId, data);
    res.json({ data: goal });
  } catch (error) {
    if (error instanceof z.ZodError) {
      next(new BadRequestError('Invalid goal data', error.issues));
    } else {
      next(error);
    }
  }
}

export async function cancelGoalController(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const auth = req.auth as AuthPayload;
    const { id } = goalIdSchema.parse(req.params);
    const goal = await goalsService.cancelGoal(id, auth.userId);
    res.json({ data: goal });
  } catch (error) {
    if (error instanceof z.ZodError) {
      next(new BadRequestError('Invalid goal ID', error.issues));
    } else {
      next(error);
    }
  }
}
