import { Prisma } from '@prisma/client';
import { prisma } from '../../db/prisma.js';
import { ConflictError, NotFoundError } from '../../common/errors/AppError.js';
import type {
  CreateModerationAppealInput,
  CreateModerationReportInput,
  ReviewModerationAppealInput,
} from './moderation.schema.js';

export async function createModerationReport(
  reporterId: string,
  input: CreateModerationReportInput,
): Promise<{ id: string; status: 'received'; createdAt: string }> {
  const audit = await prisma.auditLog.create({
    data: {
      actor: reporterId,
      action: 'moderation.report.created',
      target: `${input.targetType}:${input.targetId}`,
      metadata: {
        targetType: input.targetType,
        targetId: input.targetId,
        reason: input.reason,
        details: input.details,
        reporterId,
      } as Prisma.InputJsonValue,
    },
  });

  return {
    id: audit.id,
    status: 'received',
    createdAt: audit.createdAt.toISOString(),
  };
}

export async function createModerationAppeal(
  appellantId: string,
  input: CreateModerationAppealInput,
) {
  const existingAppeal = await prisma.moderationAppeal.findFirst({
    where: { appellantId, moderationActionId: input.moderationActionId },
    select: { id: true },
  });
  if (existingAppeal) {
    throw new ConflictError('An appeal has already been submitted for this moderation action');
  }

  try {
    return await prisma.moderationAppeal.create({
      data: {
        appellantId,
        moderationActionId: input.moderationActionId,
        reason: input.reason,
        details: input.details,
      },
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      throw new ConflictError('An appeal has already been submitted for this moderation action');
    }
    throw error;
  }
}

export async function listModerationAppeals(
  status?: 'pending' | 'upheld' | 'overturned',
) {
  return prisma.moderationAppeal.findMany({
    where: status ? { status } : undefined,
    orderBy: { createdAt: 'desc' },
  });
}

export async function reviewModerationAppeal(
  appealId: string,
  reviewerId: string,
  input: ReviewModerationAppealInput,
) {
  const appeal = await prisma.moderationAppeal.findUnique({
    where: { id: appealId },
  });
  if (!appeal) {
    throw new NotFoundError('Moderation appeal not found');
  }
  if (appeal.status !== 'pending') {
    throw new ConflictError('Moderation appeal has already been reviewed');
  }

  const review = await prisma.moderationAppeal.updateMany({
    where: { id: appealId, status: 'pending' },
    data: {
      status: input.decision,
      decision: input.decision,
      reviewNotes: input.notes,
      reviewedBy: reviewerId,
      reviewedAt: new Date(),
    },
  });
  if (review.count === 0) {
    throw new ConflictError('Moderation appeal has already been reviewed');
  }

  const updatedAppeal = await prisma.moderationAppeal.findUnique({
    where: { id: appealId },
  });
  if (!updatedAppeal) {
    throw new NotFoundError('Moderation appeal not found');
  }

  await prisma.auditLog.create({
    data: {
      actor: reviewerId,
      action: 'moderation.appeal.reviewed',
      target: appealId,
      metadata: {
        appellantId: appeal.appellantId,
        moderationActionId: appeal.moderationActionId,
        decision: input.decision,
      } as Prisma.InputJsonValue,
    },
  });

  return updatedAppeal;
}
