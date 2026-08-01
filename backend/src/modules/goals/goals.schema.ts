import { z } from 'zod';

/**
 * Zod validation schemas for the goals module.
 *
 * Covers CRUD endpoints, progress queries, and completion detection.
 */

/** Path param: goal ID. */
export const goalIdParamSchema = z.object({
  goalId: z.string().min(1, 'goalId is required'),
});

/** Body schema for creating a new goal. */
export const createGoalSchema = z.object({
  title: z.string().min(1, 'Title is required').max(200, 'Title too long'),
  targetStroops: z
    .string()
    .min(1, 'targetStroops is required')
    .regex(/^\d+$/, 'targetStroops must be a non-negative integer string'),
  deadline: z
    .string()
    .datetime({ message: 'deadline must be a valid ISO-8601 date' })
    .optional(),
});

/** Body schema for updating an existing goal. All fields optional. */
export const updateGoalSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  targetStroops: z
    .string()
    .regex(/^\d+$/, 'targetStroops must be a non-negative integer string')
    .optional(),
  deadline: z
    .string()
    .datetime()
    .nullable()
    .optional(),
  status: z.enum(['ACTIVE', 'COMPLETED', 'CANCELLED', 'EXPIRED']).optional(),
});

/** Query params for listing goals. */
export const listGoalsQuerySchema = z.object({
  page: z
    .string()
    .regex(/^\d+$/)
    .transform(Number)
    .default('1'),
  limit: z
    .string()
    .regex(/^\d+$/)
    .transform(Number)
    .default('20'),
});

/** Query params for listing goals by user (userId in query). */
export const userIdQuerySchema = z.object({
  userId: z.string().min(1, 'userId is required'),
});

export type GoalIdParam = z.infer<typeof goalIdParamSchema>;
export type CreateGoalInput = z.infer<typeof createGoalSchema>;
export type UpdateGoalInput = z.infer<typeof updateGoalSchema>;
export type ListGoalsQuery = z.infer<typeof listGoalsQuerySchema>;
export type UserIdQuery = z.infer<typeof userIdQuerySchema>;
