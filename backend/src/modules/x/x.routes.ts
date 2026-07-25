import { Router } from 'express';
import * as xController from './x.controller.js';

export const xRouter = Router();

xRouter.get('/:handle/metrics', xController.getMetrics);
