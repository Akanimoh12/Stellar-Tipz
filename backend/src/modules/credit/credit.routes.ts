import { Router } from 'express';
import * as creditController from './credit.controller.js';

export const creditRouter = Router();

creditRouter.get('/:userId', creditController.getCreditScore);
creditRouter.post('/recalculate', creditController.recalculate);
