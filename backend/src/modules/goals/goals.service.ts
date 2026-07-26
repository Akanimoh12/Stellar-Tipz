import { prisma } from '../../db/prisma.js';
import { NotFoundError, ForbiddenError } from '../../common/errors/AppError.js';
import { logger } from '../../common/utils/logger.js';
import type { GoalResponse, GoalsListResponse } from './goals.types.js';
import type { CreateGoalInput, UpdateGoalInput } from './goals.schema.js';

const GOAL_SELECT = {
  id: true,
  userId: true,
  title: true,
  targetStroops: true,
  raisedStroops: true,
  deadline: true,
  status: true,
  createdAt: true,
  updatedAt: true,
  deletedAt: true,
} as const;

function formatGoal(goal: Record<string, unknown>): GoalResponse {
  const target = BigInt(String(goal.targetStroops));
  const raised = BigInt(String(goal.raisedStroops));
  const progress = target > 0n ? Number((raised * 100n) / target) : 0;

  return {
    id: String(goal.id),
    userId: String(goal.userId),
    title: String(goal.title),
    targetStroops: target.toString(),
    raisedStroops: raised.toString(),
    progress: Math.min(progress, 100),
    deadline: goal.deadline ? new Date(goal.deadline as Date).toISOString() : null,
    status: String(goal.status),
    createdAt: new Date(goal.createdAt as Date).toISOString(),
    updatedAt: new Date(goal.updatedAt as Date).toISOString(),
  };
}

/** Returns a paginated list of goals, optionally filtered by status or userId. */
export async function getGoals(
  status: string | undefined,
  userId: string | undefined,
  limit: number,
  offset: number,
): Promise<GoalsListResponse> {
  logger.info({ status, userId, limit, offset }, 'Fetching goals');

  const where: Record<string, unknown> = { deletedAt: null };
  if (status) where.status = status;
  if (userId) where.userId = userId;

  const [rows, total] = await Promise.all([
    prisma.goal.findMany({
      where,
      select: GOAL_SELECT,
      orderBy: { createdAt: 'desc' },
      take: limit,
      skip: offset,
    }),
    prisma.goal.count({ where }),
  ]);

  return {
    data: rows.map((row) => formatGoal(row as unknown as Record<string, unknown>)),
    pagination: {
      limit,
      offset,
      total,
      hasMore: offset + rows.length < total,
    },
  };
}

/** Returns a single goal by ID. */
export async function getGoalById(id: string): Promise<GoalResponse> {
  logger.info({ goalId: id }, 'Fetching goal');

  const goal = await prisma.goal.findUnique({
    where: { id },
    select: GOAL_SELECT,
  });

  if (!goal || goal.deletedAt) {
    throw new NotFoundError('Goal not found');
  }

  return formatGoal(goal as unknown as Record<string, unknown>);
}

/** Creates a new goal for the authenticated user. */
export async function createGoal(
  userId: string,
  input: CreateGoalInput,
): Promise<GoalResponse> {
  logger.info({ userId, title: input.title }, 'Creating goal');

  const goal = await prisma.goal.create({
    data: {
      userId,
      title: input.title,
      targetStroops: BigInt(input.targetStroops),
      deadline: input.deadline ? new Date(input.deadline) : null,
    },
    select: GOAL_SELECT,
  });

  return formatGoal(goal as unknown as Record<string, unknown>);
}

/** Updates a goal. Only the owner can update. */
export async function updateGoal(
  id: string,
  userId: string,
  input: UpdateGoalInput,
): Promise<GoalResponse> {
  logger.info({ goalId: id, userId }, 'Updating goal');

  const existing = await prisma.goal.findUnique({ where: { id } });

  if (!existing || existing.deletedAt) {
    throw new NotFoundError('Goal not found');
  }

  if (existing.userId !== userId) {
    throw new ForbiddenError('You can only update your own goals');
  }

  const data: Record<string, unknown> = {};
  if (input.title !== undefined) data.title = input.title;
  if (input.targetStroops !== undefined) data.targetStroops = BigInt(input.targetStroops);
  if (input.deadline !== undefined) data.deadline = input.deadline ? new Date(input.deadline) : null;

  const goal = await prisma.goal.update({
    where: { id },
    data,
    select: GOAL_SELECT,
  });

  return formatGoal(goal as unknown as Record<string, unknown>);
}

/** Soft-deletes a goal. Only the owner can delete. */
export async function deleteGoal(id: string, userId: string): Promise<void> {
  logger.info({ goalId: id, userId }, 'Deleting goal');

  const existing = await prisma.goal.findUnique({ where: { id } });

  if (!existing || existing.deletedAt) {
    throw new NotFoundError('Goal not found');
  }

  if (existing.userId !== userId) {
    throw new ForbiddenError('You can only delete your own goals');
  }

  await prisma.goal.update({
    where: { id },
    data: { deletedAt: new Date() },
  });
}
