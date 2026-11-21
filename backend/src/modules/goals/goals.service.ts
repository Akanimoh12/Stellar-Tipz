import { prisma } from '../../db/prisma.js';
import { NotFoundError } from '../../common/errors/AppError.js';
import { assertOwnership } from '../../common/utils/ownership.js';
import type { GoalResponse, GoalListResponse } from './goals.types.js';
import type { CreateGoalInput, UpdateGoalInput } from './goals.schema.js';

function serializeGoal(goal: {
  id: string;
  userId: string;
  title: string;
  targetStroops: bigint;
  raisedStroops: bigint;
  deadline: Date | null;
  status: string;
  createdAt: Date;
  updatedAt: Date;
}): GoalResponse {
  return {
    id: goal.id,
    userId: goal.userId,
    title: goal.title,
    targetStroops: goal.targetStroops.toString(),
    raisedStroops: goal.raisedStroops.toString(),
    deadline: goal.deadline?.toISOString() ?? null,
    status: goal.status,
    createdAt: goal.createdAt.toISOString(),
    updatedAt: goal.updatedAt.toISOString(),
  };
}

export async function createGoal(
  userId: string,
  data: CreateGoalInput,
): Promise<GoalResponse> {
  const goal = await prisma.goal.create({
    data: {
      userId,
      title: data.title,
      targetStroops: BigInt(data.targetStroops),
      deadline: data.deadline ? new Date(data.deadline) : null,
    },
  });

  return serializeGoal(goal);
}

export async function getGoalById(goalId: string): Promise<GoalResponse> {
  const goal = await prisma.goal.findUnique({ where: { id: goalId } });

  if (!goal || goal.deletedAt !== null) {
    throw new NotFoundError('Goal not found');
  }

  return serializeGoal(goal);
}

export async function listGoals(
  limit: number,
  offset: number,
  status?: string,
): Promise<GoalListResponse> {
  const where: Record<string, unknown> = { deletedAt: null };
  if (status) where.status = status;

  const [goals, total] = await Promise.all([
    prisma.goal.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: limit,
      skip: offset,
    }),
    prisma.goal.count({ where }),
  ]);

  return {
    data: goals.map(serializeGoal),
    pagination: {
      limit,
      offset,
      total,
      hasMore: offset + goals.length < total,
    },
  };
}

export async function updateGoal(
  goalId: string,
  userId: string,
  data: UpdateGoalInput,
): Promise<GoalResponse> {
  const goal = await prisma.goal.findUnique({ where: { id: goalId } });

  if (!goal || goal.deletedAt !== null) {
    throw new NotFoundError('Goal not found');
  }

  assertOwnership(goal.userId, userId, 'You can only update your own goals');

  const updateData: Record<string, unknown> = {};
  if (data.title !== undefined) updateData.title = data.title;
  if (data.targetStroops !== undefined) updateData.targetStroops = BigInt(data.targetStroops);
  if (data.deadline !== undefined) updateData.deadline = data.deadline ? new Date(data.deadline) : null;
  if (data.status !== undefined) updateData.status = data.status;

  const updated = await prisma.goal.update({
    where: { id: goalId },
    data: updateData,
  });

  return serializeGoal(updated);
}

export async function cancelGoal(
  goalId: string,
  userId: string,
): Promise<GoalResponse> {
  const goal = await prisma.goal.findUnique({ where: { id: goalId } });

  if (!goal || goal.deletedAt !== null) {
    throw new NotFoundError('Goal not found');
  }

  assertOwnership(goal.userId, userId, 'You can only cancel your own goals');

  const updated = await prisma.goal.update({
    where: { id: goalId },
    data: { status: 'CANCELLED' },
  });

  return serializeGoal(updated);
}
