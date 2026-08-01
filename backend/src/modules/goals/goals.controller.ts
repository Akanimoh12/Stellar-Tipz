import type { Request, Response, NextFunction } from 'express';
import { goalsQuerySchema, createGoalSchema, updateGoalSchema, goalIdParamSchema } from './goals.schema.js';
import * as goalsService from './goals.service.js';
import { UnauthorizedError } from '../../common/errors/AppError.js';

function getUserId(req: Request): string {
  if (!req.auth) {
    throw new UnauthorizedError('Authentication required');
  }
  return req.auth.userId;
}

/** GET /goals — list goals with optional filters. */
export async function listGoals(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { status, userId, limit, offset } = goalsQuerySchema.parse(req.query);
    const result = await goalsService.getGoals(status, userId, limit, offset);
    res.status(200).json(result);
  } catch (err) {
    next(err);
  }
}

/** GET /goals/:id — get a single goal. */
export async function getGoal(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { id } = goalIdParamSchema.parse(req.params);
    const result = await goalsService.getGoalById(id);
    res.status(200).json({ data: result });
  } catch (err) {
    next(err);
  }
}

/** POST /goals — create a new goal. */
export async function createGoal(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const userId = getUserId(req);
    const input = createGoalSchema.parse(req.body);
    const result = await goalsService.createGoal(userId, input);
    res.status(201).json({ data: result });
  } catch (err) {
    next(err);
  }
}

/** PUT /goals/:id — update a goal. */
export async function updateGoal(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const userId = getUserId(req);
    const { id } = goalIdParamSchema.parse(req.params);
    const input = updateGoalSchema.parse(req.body);
    const result = await goalsService.updateGoal(id, userId, input);
    res.status(200).json({ data: result });
  } catch (err) {
    next(err);
  }
}

/** DELETE /goals/:id — soft-delete a goal. */
export async function deleteGoal(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const userId = getUserId(req);
    const { id } = goalIdParamSchema.parse(req.params);
    await goalsService.deleteGoal(id, userId);
    res.status(204).send();
  } catch (err) {
    next(err);
import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { BadRequestError } from '../../common/errors/AppError.js';
import {
  createGoal,
  getGoalById,
  getGoalsByUser,
  updateGoal,
  deleteGoal,
  getGoalProgress,
} from './goals.service.js';
import {
  goalIdParamSchema,
  createGoalSchema,
  updateGoalSchema,
  listGoalsQuerySchema,
  userIdQuerySchema,
} from './goals.schema.js';
import type { AuthPayload } from '../auth/auth.types.js';

/**
 * POST /goals
 * Creates a new funding goal for the authenticated user.
 */
export async function createGoalController(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const auth = req.auth as AuthPayload;
    const data = createGoalSchema.parse(req.body);
    const goal = await createGoal(auth.userId, data);
    res.status(201).json({ data: goal });
  } catch (error) {
    if (error instanceof z.ZodError) {
      next(new BadRequestError('Invalid goal data', error.issues));
    } else {
      next(error);
    }
  }
}

/**
 * GET /goals?userId=...
 * Lists goals for a user with pagination.
 */
export async function listGoalsController(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const { userId } = userIdQuerySchema.parse(req.query);
    const { page, limit } = listGoalsQuerySchema.parse(req.query);
    const result = await getGoalsByUser(userId, page, limit);
    res.json(result);
  } catch (error) {
    if (error instanceof z.ZodError) {
      next(new BadRequestError('Invalid query parameters', error.issues));
    } else {
      next(error);
    }
  }
}

/**
 * GET /goals/:goalId
 * Returns a single goal by ID.
 */
export async function getGoalController(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const { goalId } = goalIdParamSchema.parse(req.params);
    const goal = await getGoalById(goalId);
    res.json({ data: goal });
  } catch (error) {
    if (error instanceof z.ZodError) {
      next(new BadRequestError('Invalid goal ID', error.issues));
    } else {
      next(error);
    }
  }
}

/**
 * PATCH /goals/:goalId
 * Updates a goal (owner only).
 */
export async function updateGoalController(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const auth = req.auth as AuthPayload;
    const { goalId } = goalIdParamSchema.parse(req.params);
    const data = updateGoalSchema.parse(req.body);

    // Verify ownership.
    const existing = await getGoalById(goalId);
    if (existing.userId !== auth.userId) {
      throw new BadRequestError('You can only update your own goals');
    }

    const goal = await updateGoal(goalId, data);
    res.json({ data: goal });
  } catch (error) {
    if (error instanceof z.ZodError) {
      next(new BadRequestError('Invalid goal data', error.issues));
    } else {
      next(error);
    }
  }
}

/**
 * DELETE /goals/:goalId
 * Deletes a goal (owner only).
 */
export async function deleteGoalController(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const auth = req.auth as AuthPayload;
    const { goalId } = goalIdParamSchema.parse(req.params);

    // Verify ownership.
    const existing = await getGoalById(goalId);
    if (existing.userId !== auth.userId) {
      throw new BadRequestError('You can only delete your own goals');
    }

    await deleteGoal(goalId);
    res.status(204).send();
  } catch (error) {
    if (error instanceof z.ZodError) {
      next(new BadRequestError('Invalid goal ID', error.issues));
    } else {
      next(error);
    }
  }
}

/**
 * GET /goals/:goalId/progress
 * Returns a goal enriched with computed progress fields.
 */
export async function getGoalProgressController(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const { goalId } = goalIdParamSchema.parse(req.params);
    const progress = await getGoalProgress(goalId);
    res.json({ data: progress });
  } catch (error) {
    if (error instanceof z.ZodError) {
      next(new BadRequestError('Invalid goal ID', error.issues));
    } else {
      next(error);
    }
  }
}
