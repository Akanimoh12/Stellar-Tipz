import { Router } from 'express';
import { requireAuth } from '../auth/auth.middleware.js';
import { requireRole } from '../auth/auth.middleware.js';
import { listUsersController, suspendUserController } from './admin.controller.js';

export const adminRouter = Router();

adminRouter.get('/users', requireAuth, requireRole('admin'), listUsersController);
adminRouter.post('/users/:id/suspend', requireAuth, requireRole('admin'), suspendUserController);
