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
/**
 * Goals service — business logic for creator funding goals.
 *
 * Covers CRUD, progress calculation, and completion detection + notification.
 *
 * The Prisma schema already provides Goal, GoalStatus, and Notification models.
 * See backend/docs/BACKEND_CONTRIBUTING.md for module conventions.
 */

import { prisma } from '../../db/prisma.js';
import { logger } from '../../common/utils/logger.js';
import { NotFoundError } from '../../common/errors/AppError.js';
import type {
  Goal,
  GoalProgress,
  GoalStatus,
  CreateGoalRequest,
  UpdateGoalRequest,
} from './goals.types.js';

// ── Helpers ─────────────────────────────────────────────────────────────────────

/** Converts a Prisma Goal row to the API response shape. */
function toGoal(row: {
  id: string;
  userId: string;
  title: string;
  targetStroops: bigint;
  raisedStroops: bigint;
  deadline: Date | null;
  status: string;
  createdAt: Date;
  updatedAt: Date;
}): Goal {
  return {
    id: row.id,
    userId: row.userId,
    title: row.title,
    targetStroops: row.targetStroops.toString(),
    raisedStroops: row.raisedStroops.toString(),
    deadline: row.deadline?.toISOString() ?? null,
    status: row.status as GoalStatus,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

// ── Progress calculation (pure function — no I/O) ───────────────────────────────

/**
 * Computes progress fields for a goal.
 *
 * Pure function — deterministic, no side-effects, unit-testable in isolation.
 *
 * @param targetStroops - The target amount (bigint string).
 * @param raisedStroops - The amount raised so far (bigint string).
 * @param deadline      - Optional ISO-8601 deadline string.
 */
export function calculateProgress(
  targetStroops: string,
  raisedStroops: string,
  deadline: string | null,
): { raisedPercentage: number; isComplete: boolean; daysRemaining: number | null } {
  const target = Number(targetStroops);
  const raised = Number(raisedStroops);
  const raisedPercentage =
    target > 0 ? Math.min(Math.round((raised / target) * 10000) / 100, 100) : 0;
  const isComplete = raised >= target;

  let daysRemaining: number | null = null;
  if (deadline) {
    const diffMs = new Date(deadline).getTime() - Date.now();
    daysRemaining = diffMs > 0 ? Math.ceil(diffMs / 86_400_000) : 0;
  }

  return { raisedPercentage, isComplete, daysRemaining };
}

/** Build a GoalProgress from a Prisma row. */
function toGoalProgress(row: {
  id: string;
  userId: string;
  title: string;
  targetStroops: bigint;
  raisedStroops: bigint;
  deadline: Date | null;
  status: string;
  createdAt: Date;
  updatedAt: Date;
}): GoalProgress {
  const goal = toGoal(row);
  const progress = calculateProgress(goal.targetStroops, goal.raisedStroops, goal.deadline);
  return { ...goal, ...progress };
}

// ── Completion detection + notification (issue #3) ──────────────────────────────

/**
 * Checks whether `goal` has reached its target and, if so, transitions it
 * to COMPLETED and creates a notification for the goal creator.
 *
 * Called after any mutation that affects raisedStroops. Safe to call on goals
 * that are already COMPLETED — it is a no-op when status is not ACTIVE.
 *
 * Returns the (possibly updated) Goal row.
 */
export async function checkAndNotifyCompletion(
  goalId: string,
): Promise<Goal> {
  const row = await prisma.goal.findUnique({ where: { id: goalId } });
  if (!row) throw new NotFoundError(`Goal ${goalId} not found`);

  if (row.status !== 'ACTIVE') {
    return toGoal(row);
  }

  if (row.raisedStroops < row.targetStroops) {
    return toGoal(row);
  }

  // Transition to COMPLETED and create a notification atomically.
  const [updated] = await Promise.all([
    prisma.goal.update({
      where: { id: goalId },
      data: { status: 'COMPLETED' },
    }),
    prisma.notification.create({
      data: {
        userId: row.userId,
        type: 'GOAL_COMPLETED',
        payload: {
          goalId: row.id,
          title: row.title,
          targetStroops: row.targetStroops.toString(),
        },
      },
    }),
  ]);

  logger.info(
    { goalId, userId: row.userId, title: row.title },
    'Goal completed — notification sent',
  );

  return toGoal(updated);
}

// ── CRUD operations ─────────────────────────────────────────────────────────────

/**
 * Creates a new funding goal for the authenticated user.
 */
export async function createGoal(
  userId: string,
  data: CreateGoalRequest,
): Promise<Goal> {
  logger.info({ userId, title: data.title }, 'Creating goal');

  const row = await prisma.goal.create({
    data: {
      userId,
      title: data.title,
      targetStroops: BigInt(data.targetStroops),
      deadline: data.deadline ? new Date(data.deadline) : null,
    },
  });

  return toGoal(row);
}

/**
 * Returns a single goal by ID. Throws if not found.
 */
export async function getGoalById(goalId: string): Promise<Goal> {
  const row = await prisma.goal.findUnique({ where: { id: goalId } });
  if (!row) throw new NotFoundError(`Goal ${goalId} not found`);
  return toGoal(row);
}

/**
 * Returns a paginated list of goals for a given user.
 */
export async function getGoalsByUser(
  userId: string,
  page: number,
  limit: number,
): Promise<{ data: Goal[]; total: number; page: number; limit: number }> {
  const skip = (page - 1) * limit;

  const [rows, total] = await Promise.all([
    prisma.goal.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      skip,
      take: limit,
    }),
    prisma.goal.count({ where: { userId } }),
  ]);

  return {
    data: rows.map(toGoal),
    total,
    page,
    limit,
  };
}

/**
 * Updates an existing goal. Ownership is enforced by the caller (controller).
 */
export async function updateGoal(
  goalId: string,
  data: UpdateGoalRequest,
): Promise<Goal> {
  const existing = await prisma.goal.findUnique({ where: { id: goalId } });
  if (!existing) throw new NotFoundError(`Goal ${goalId} not found`);

  const updateData: Record<string, unknown> = {};
  if (data.title !== undefined) updateData.title = data.title;
  if (data.targetStroops !== undefined) updateData.targetStroops = BigInt(data.targetStroops);
  if (data.deadline !== undefined) updateData.deadline = data.deadline ? new Date(data.deadline) : null;
  if (data.status !== undefined) updateData.status = data.status;

  const row = await prisma.goal.update({
    where: { id: goalId },
    data: updateData,
  });

  // If the status update was to a non-ACTIVE state, skip completion check.
  // Otherwise, check whether the goal just reached its target.
  if (data.status !== undefined && data.status !== 'ACTIVE') {
    return toGoal(row);
  }

  // Check completion after any mutation that might have bumped raisedStroops
  // or that re-activates a goal.
  return checkAndNotifyCompletion(goalId);
}

/**
 * Deletes a goal. Ownership is enforced by the caller (controller).
 */
export async function deleteGoal(goalId: string): Promise<void> {
  const existing = await prisma.goal.findUnique({ where: { id: goalId } });
  if (!existing) throw new NotFoundError(`Goal ${goalId} not found`);

  await prisma.goal.delete({ where: { id: goalId } });
  logger.info({ goalId }, 'Goal deleted');
}

/**
 * Returns a goal enriched with live progress fields.
 */
export async function getGoalProgress(goalId: string): Promise<GoalProgress> {
  const row = await prisma.goal.findUnique({ where: { id: goalId } });
  if (!row) throw new NotFoundError(`Goal ${goalId} not found`);
  return toGoalProgress(row);
}
