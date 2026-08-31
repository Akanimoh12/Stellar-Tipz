import type { Prisma } from '@prisma/client';
import { prisma } from '../../db/prisma.js';
import type { CreateModerationReportInput } from './moderation.schema.js';

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
