import { Router } from 'express';
import * as leaderboardController from './leaderboard.controller.js';

export const leaderboardRouter = Router();

leaderboardRouter.get('/', leaderboardController.getLeaderboard);
leaderboardRouter.get('/:userId', leaderboardController.getUserRank);
