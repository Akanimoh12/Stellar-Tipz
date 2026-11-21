import { prisma } from '../../db/prisma.js';
import { logger } from '../../common/utils/logger.js';
import { computeCreditScore } from './credit.service.js';

const BATCH_SIZE = 50;

export interface BackfillResult {
  totalUsers: number;
  processed: number;
  skipped: number;
  errors: number;
}

export async function backfillCreditScores(): Promise<BackfillResult> {
  const result: BackfillResult = { totalUsers: 0, processed: 0, skipped: 0, errors: 0 };
  let cursor: string | undefined;

  const totalUsers = await prisma.user.count({ where: { deletedAt: null } });
  result.totalUsers = totalUsers;

  logger.info({ totalUsers }, 'Starting credit score backfill');

  while (true) {
    const users = await prisma.user.findMany({
      where: { deletedAt: null },
      take: BATCH_SIZE,
      ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
      orderBy: { id: 'asc' },
      include: { streak: true },
    });

    if (users.length === 0) break;

    for (const user of users) {
      try {
        const totalTipsAgg = await prisma.tip.aggregate({
          where: { toAddress: user.stellarAddress, status: 'CONFIRMED' },
          _sum: { amountStroops: true },
        });

        const totalTipsReceived = totalTipsAgg._sum.amountStroops ?? BigInt(0);

        const accountAgeDays = Math.floor(
          (Date.now() - user.createdAt.getTime()) / (1000 * 60 * 60 * 24),
        );

        const streakBonus = user.streak ? Math.floor(user.streak.currentStreak / 7) : 0;

        const scoreResult = computeCreditScore({
          totalTipsReceived,
          xFollowers: 0,
          xEngagementAvg: 0,
          accountAgeDays,
          streakBonus,
        });

        await prisma.$transaction(
          async (tx) => {
            await tx.creditScore.upsert({
              where: { userId: user.id },
              update: { value: scoreResult.score, computedAt: new Date() },
              create: { userId: user.id, value: scoreResult.score },
            });
            await tx.creditScoreHistory.create({
              data: { userId: user.id, value: scoreResult.score },
            });
          },
          {
            timeout: 5000,
            maxWait: 2000,
            isolationLevel: "ReadCommitted",
          },
        );

        result.processed++;
      } catch (err) {
        logger.error({ err, userId: user.id }, 'Failed to backfill credit score for user');
        result.errors++;
      }
    }

    cursor = users[users.length - 1].id;
  }

  logger.info(
    { totalUsers: result.totalUsers, processed: result.processed, skipped: result.skipped, errors: result.errors },
    'Credit score backfill completed',
  );

  return result;
}
