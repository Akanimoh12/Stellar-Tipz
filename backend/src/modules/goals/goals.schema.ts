import { z } from 'zod';

export const createGoalSchema = z.object({
  title: z.string().min(1).max(200),
  targetStroops: z.string().regex(/^\d+$/, 'Must be a positive integer string'),
  deadline: z.string().datetime({ offset: true }).optional(),
});

export const updateGoalSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  targetStroops: z.string().regex(/^\d+$/, 'Must be a positive integer string').optional(),
  deadline: z.string().datetime({ offset: true }).nullable().optional(),
  status: z.enum(['ACTIVE', 'CANCELLED']).optional(),
});

export const goalIdSchema = z.object({
  id: z.string().min(1),
});

export const goalListQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
  offset: z.coerce.number().int().min(0).default(0),
  status: z.enum(['ACTIVE', 'COMPLETED', 'CANCELLED', 'EXPIRED']).optional(),
});

export type CreateGoalInput = z.infer<typeof createGoalSchema>;
export type UpdateGoalInput = z.infer<typeof updateGoalSchema>;
export type GoalIdInput = z.infer<typeof goalIdSchema>;
export type GoalListQuery = z.infer<typeof goalListQuerySchema>;
