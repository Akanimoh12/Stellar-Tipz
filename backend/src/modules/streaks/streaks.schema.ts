import { z } from 'zod';

export const getStreakQuerySchema = z.object({
  userId: z.string().optional(),
});

export type GetStreakQuery = z.infer<typeof getStreakQuerySchema>;
