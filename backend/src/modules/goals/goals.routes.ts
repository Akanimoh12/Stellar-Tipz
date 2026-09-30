import { Router } from 'express';
import { requireAuth } from '../auth/auth.middleware.js';
import {
  createGoalController,
  getGoalController,
  listGoalsController,
  updateGoalController,
  cancelGoalController,
} from './goals.controller.js';

export const goalsRouter = Router();

goalsRouter.get('/', listGoalsController);
goalsRouter.get('/:id', getGoalController);
goalsRouter.post('/', requireAuth, createGoalController);
goalsRouter.patch('/:id', requireAuth, updateGoalController);
goalsRouter.delete('/:id', requireAuth, cancelGoalController);
