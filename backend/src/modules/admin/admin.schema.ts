import { z } from 'zod';

export const createAuditLogSchema = z.object({
  action: z.string().min(1).max(255),
  target: z.string().optional().nullable(),
  metadata: z.record(z.unknown()).default({}),
});

export const listAuditLogsQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
  offset: z.coerce.number().int().min(0).default(0),
  action: z.string().optional(),
  actor: z.string().optional(),
});

export const platformStatsResponseSchema = z.object({
  totalUsers: z.number(),
  totalCreators: z.number(),
  totalTips: z.number(),
  totalTipAmountStroops: z.string(),
  activeUsersLast30Days: z.number(),
  totalSubscriptions: z.number(),
  totalRefunds: z.number(),
  averageTipAmount: z.string(),
});
