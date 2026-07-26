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
  }
}
