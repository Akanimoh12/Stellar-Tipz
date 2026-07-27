import { Router } from 'express';
import { requireAuth } from '../auth/auth.middleware.js';
import {
  createGoalController,
  listGoalsController,
  getGoalController,
  updateGoalController,
  deleteGoalController,
  getGoalProgressController,
} from './goals.controller.js';

/**
 * Goals module router.
 * Mounted at /api/v1/goals in app.ts
 */
export const goalsRouter = Router();

/** All goal routes require authentication. */
goalsRouter.post('/', requireAuth, createGoalController);
goalsRouter.get('/', requireAuth, listGoalsController);
goalsRouter.get('/:goalId', requireAuth, getGoalController);
goalsRouter.patch('/:goalId', requireAuth, updateGoalController);
goalsRouter.delete('/:goalId', requireAuth, deleteGoalController);
goalsRouter.get('/:goalId/progress', requireAuth, getGoalProgressController);
