import { Router } from 'express';
import { feeConfigRouter } from './fee.config.routes.js';
import { limitsConfigRouter } from './limits.config.routes.js';
import { pauseConfigRouter } from './pause.config.routes.js';

export const adminConfigRouter = Router();

adminConfigRouter.use(feeConfigRouter);
adminConfigRouter.use(limitsConfigRouter);
adminConfigRouter.use(pauseConfigRouter);

export { feeConfigRouter, limitsConfigRouter, pauseConfigRouter };
