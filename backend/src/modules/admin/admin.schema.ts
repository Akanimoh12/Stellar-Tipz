import { z } from 'zod';

export const listUsersQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  role: z.string().optional(),
});

export const suspendUserParamSchema = z.object({
  id: z.string().min(1),
});

export const suspendUserBodySchema = z.object({
  reason: z.string().min(1).max(500).optional(),
});

export type ListUsersQuery = z.infer<typeof listUsersQuerySchema>;
export type SuspendUserParams = z.infer<typeof suspendUserParamSchema>;
export type SuspendUserBody = z.infer<typeof suspendUserBodySchema>;
