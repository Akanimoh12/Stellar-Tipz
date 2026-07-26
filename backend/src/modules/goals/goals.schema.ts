import { z } from 'zod';

/** Schema for creating a goal. */
export const createGoalSchema = z.object({
  title: z.string().min(1).max(200),
  targetStroops: z.string().regex(/^\d+$/, 'Must be a positive integer string'),
  deadline: z.string().datetime({ offset: true }).optional(),
});

export type CreateGoalInput = z.infer<typeof createGoalSchema>;

/** Schema for updating a goal. */
export const updateGoalSchema = createGoalSchema.partial();

export type UpdateGoalInput = z.infer<typeof updateGoalSchema>;

/** Query parameters for GET /goals. */
export const goalsQuerySchema = z.object({
  status: z.enum(['ACTIVE', 'COMPLETED', 'CANCELLED', 'EXPIRED']).optional(),
  userId: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
  offset: z.coerce.number().int().min(0).default(0),
});

export type GoalsQuery = z.infer<typeof goalsQuerySchema>;

/** Path parameter schema for goal ID. */
export const goalIdParamSchema = z.object({
  id: z.string().min(1),
});

export type GoalIdParam = z.infer<typeof goalIdParamSchema>;
