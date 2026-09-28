import { z } from 'zod';

export const getStreakQuerySchema = z.object({
  userId: z.string().optional(),
}).strict();

export type GetStreakQuery = z.infer<typeof getStreakQuerySchema>;
