import { Router } from 'express';
import {
  challengeController,
  verifyController,
  meController,
  refreshController,
  logoutController,
} from './auth.controller.js';
import { authMiddleware } from './auth.middleware.js';

/**
 * Auth module router.
 * Mounted at /api/v1/auth in app.ts
 */
export const authRouter = Router();

// POST /auth/challenge — create authentication challenge
authRouter.post('/challenge', challengeController);

// POST /auth/verify — verify signed challenge and get tokens
authRouter.post('/verify', verifyController);

// GET /auth/me — get current user profile summary (requires auth)
authRouter.get('/me', authMiddleware, meController);

// POST /auth/refresh — refresh access token
authRouter.post('/refresh', refreshController);

// POST /auth/logout — revoke refresh token
authRouter.post('/logout', logoutController);
